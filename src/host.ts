import type { BaseMessage } from "@langchain/core/messages";
import type { SqliteSaver } from "@langchain/langgraph-checkpoint-sqlite";
import { buildGraph } from "./agent";
import { loadSettings, sessionPaths } from "./config";
import { AgentDatabase } from "./database";
import { Logger } from "./logger";
import { loadMcp } from "./mcp";
import type { QueueItem, Settings } from "./types";

type HostMode = { kind: "new" | "load"; sessionId: string };

let stopping = false;

class CanceledRun extends Error {}

export async function runHost(mode: HostMode, root = process.cwd()) {
  const settings = loadSettings(root);
  const logger = new Logger(settings.logging.level);
  const paths = sessionPaths(settings, mode.sessionId);
  const db = new AgentDatabase(paths.appDb);
  if (mode.kind === "new") {
    db.resetSession(mode.sessionId);
    logger.info("已创建新会话", { sessionId: mode.sessionId, db: paths.appDb });
  } else {
    db.ensureSession(mode.sessionId);
    logger.info("已加载会话", { sessionId: mode.sessionId, db: paths.appDb });
  }
  const mcp = await loadMcp(root, logger);
  const { graph, checkpointer } = buildGraph(
    settings,
    mcp.tools,
    paths.checkpointDb,
  );
  process.on("SIGINT", () => {
    stopping = true;
    logger.warn("收到 Ctrl+C，Host 将在当前边界停止");
  });
  try {
    await hostLoop({
      settings,
      logger,
      db,
      graph,
      checkpointer,
      sessionId: mode.sessionId,
    });
  } finally {
    await mcp.close();
    db.close();
  }
}

async function hostLoop(ctx: HostContext) {
  let lastIdle = 0;
  while (!stopping) {
    const item = ctx.db.nextQueue(ctx.sessionId);
    if (!item) {
      const now = Date.now();
      if (now - lastIdle >= ctx.settings.host.idleLogMs) {
        ctx.logger.debug("等待 Client 输入", { sessionId: ctx.sessionId });
        lastIdle = now;
      }
      await sleep(ctx.settings.host.pollMs);
      continue;
    }
    await processQueue(ctx, item);
  }
}

type HostContext = {
  settings: Settings;
  logger: Logger;
  db: AgentDatabase;
  graph: any;
  checkpointer: SqliteSaver;
  sessionId: string;
};

async function processQueue(ctx: HostContext, item: QueueItem) {
  const end = ctx.logger.child(`队列 #${item.id}`);
  const threadId = `${ctx.sessionId}:${item.id}`;
  try {
    ctx.db.startQueue(ctx.sessionId, item);
    await waitIfPaused(ctx, item);
    let input: unknown =
      item.status === "pending"
        ? { messages: ctx.db.history(ctx.sessionId) }
        : null;
    const config = {
      configurable: { thread_id: threadId },
      recursionLimit: ctx.settings.host.recursionLimit,
    };
    while (!stopping) {
      const stream = await ctx.graph.stream(input, {
        ...config,
        streamMode: ["messages", "updates", "debug"],
      });
      for await (const event of stream) {
        handleStreamEvent(ctx, event);
      }
      const control = ctx.db.control(ctx.sessionId);
      if (control === "cancel") {
        await cancelQueue(ctx, item, threadId);
        return;
      }
      const state = await ctx.graph.getState(config);
      ctx.logger.debug("LangGraph 边界", {
        next: state.next,
        tasks: state.tasks?.map((task: { name: string }) => task.name) ?? [],
      });
      if (!state.next || state.next.length === 0) {
        finishQueue(ctx, item, state.values?.messages ?? []);
        return;
      }
      if (control === "pause") {
        ctx.db.setQueueStatus(item.id, "paused");
        ctx.logger.warn("已在节点边界暂停", {
          queueId: item.id,
          next: state.next,
        });
        await waitIfPaused(ctx, { ...item, status: "paused" });
      }
      input = null;
    }
  } catch (error) {
    if (error instanceof CanceledRun) {
      return;
    }
    const message = error instanceof Error ? error.message : String(error);
    ctx.db.setQueueStatus(item.id, "failed", message);
    ctx.logger.error("队列执行失败", { queueId: item.id, error: message });
  } finally {
    end();
  }
}

function handleStreamEvent(ctx: HostContext, event: unknown) {
  if (!Array.isArray(event) || event.length !== 2) {
    ctx.logger.debug("LangGraph 事件", event);
    return;
  }
  const [mode, payload] = event;
  if (mode === "messages") {
    const chunk = Array.isArray(payload) ? payload[0] : undefined;
    const text = contentToText(chunk?.content);
    if (text && ctx.settings.logging.streamTokens) {
      ctx.logger.token(text);
    }
    return;
  }
  if (mode === "updates") {
    ctx.logger.debug("状态更新", summarize(payload));
    return;
  }
  ctx.logger.debug("调试事件", summarize(payload));
}

async function waitIfPaused(ctx: HostContext, item: QueueItem) {
  while (!stopping) {
    const control = ctx.db.control(ctx.sessionId);
    if (control === "cancel") {
      await cancelQueue(ctx, item, `${ctx.sessionId}:${item.id}`);
      throw new CanceledRun("运行已取消");
    }
    if (control === "running") {
      ctx.db.setQueueStatus(item.id, "running");
      return;
    }
    ctx.logger.info("暂停中，等待 resume 或 cancel", { queueId: item.id });
    await sleep(ctx.settings.host.pausePollMs);
  }
}

function finishQueue(
  ctx: HostContext,
  item: QueueItem,
  messages: BaseMessage[],
) {
  const last = messages.findLast((message) => message.getType() === "ai");
  const content = contentToText(last?.content);
  if (!content) {
    throw new Error("模型没有生成可记录的最终文本");
  }
  ctx.db.appendAssistant(ctx.sessionId, item.id, content);
  ctx.db.setQueueStatus(item.id, "done");
  ctx.logger.info("队列完成", { queueId: item.id, chars: content.length });
  if (ctx.settings.logging.streamTokens) {
    process.stdout.write("\n");
  }
}

async function cancelQueue(
  ctx: HostContext,
  item: QueueItem,
  threadId: string,
) {
  ctx.db.setQueueStatus(item.id, "canceled");
  ctx.db.setControl(ctx.sessionId, "running");
  await ctx.checkpointer.deleteThread(threadId);
  ctx.logger.warn("队列已取消", { queueId: item.id });
}

function contentToText(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .map((part) =>
        typeof part === "string"
          ? part
          : typeof part?.text === "string"
            ? part.text
            : "",
      )
      .join("");
  }
  return "";
}

function summarize(value: unknown) {
  return JSON.parse(
    JSON.stringify(value, (_key, current) =>
      typeof current === "string" && current.length > 240
        ? `${current.slice(0, 240)}…`
        : current,
    ),
  );
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
