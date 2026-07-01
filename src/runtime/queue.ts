import type { BaseMessage } from "@langchain/core/messages";
import { Command } from "@langchain/langgraph";
import type { QueueItem } from "../types";
import type { HostContext } from "./context";
import { contentToText } from "./content";
import { isModelNetworkError } from "./network";
import { waitBeforeModelNetworkRetry } from "./retry";
import { handleStreamEvent } from "./stream";
import { sleep } from "./time";

class CanceledRun extends Error {}

type QueueRun = {
  items: [QueueItem, ...QueueItem[]];
  threadId: string;
};

export async function processQueue(ctx: HostContext, item: QueueItem) {
  const end = ctx.logger.child(`队列 #${item.id}`);
  const run: QueueRun = {
    items: [item],
    threadId: `${ctx.sessionId}:${item.id}`,
  };
  try {
    ctx.db.startQueue(ctx.sessionId, item);
    if (!(await waitIfPaused(ctx, run))) return;
    await runGraphUntilBoundary(ctx, run);
  } catch (error) {
    if (error instanceof CanceledRun) return;
    const message = error instanceof Error ? error.message : String(error);
    setRunStatus(ctx, run, "failed", message);
    ctx.logger.error("队列执行失败", { queueId: item.id, error: message });
  } finally {
    end();
  }
}

async function runGraphUntilBoundary(ctx: HostContext, run: QueueRun) {
  const [item] = run.items;
  let input: unknown =
    item.status === "pending"
      ? { messages: ctx.db.history(ctx.sessionId) }
      : null;
  const config = {
    configurable: { thread_id: run.threadId },
    recursionLimit: ctx.settings.host.recursionLimit,
    interruptAfter: ["model_request", "tools"],
  };
  let modelNetworkRetry = 0;
  while (!ctx.signal.stopping) {
    try {
      const stream = await ctx.graph.stream(input, {
        ...config,
        streamMode: ["messages", "updates", "debug"],
      });
      for await (const event of stream) handleStreamEvent(ctx, event);
      modelNetworkRetry = 0;
    } catch (error) {
      if (!isModelNetworkError(error) || ctx.signal.stopping) {
        throw error;
      }
      modelNetworkRetry += 1;
      const shouldRetry = await waitBeforeModelNetworkRetry(
        ctx,
        run,
        error,
        modelNetworkRetry,
        {
          stop: () => setRunStatus(ctx, run, "paused"),
          pause: async () => {
            setRunStatus(ctx, run, "paused");
            return waitIfPaused(ctx, run);
          },
          cancel: async () => {
            await cancelRun(ctx, run);
            throw new CanceledRun("运行已取消");
          },
        },
      );
      if (!shouldRetry) return;
      continue;
    }
    const control = ctx.db.control(ctx.sessionId);
    if (control === "cancel") {
      await cancelRun(ctx, run);
      return;
    }
    const state = await ctx.graph.getState(config);
    ctx.logger.debug("LangGraph 边界", {
      next: state.next,
      tasks: state.tasks?.map((task: { name: string }) => task.name) ?? [],
    });
    if (control === "pause" || control === "pause_cancel") {
      setRunStatus(ctx, run, "paused");
      ctx.logger.warn("已在节点边界暂停", {
        queueId: item.id,
        next: state.next,
      });
      await waitIfPaused(ctx, run);
    }
    const appendInput = consumeBoundaryAppends(ctx, run, state);
    if (appendInput) {
      input = appendInput;
      continue;
    }
    if (!state.next || state.next.length === 0) {
      finishRun(ctx, run, state.values?.messages ?? []);
      return;
    }
    input = null;
  }
}

function consumeBoundaryAppends(
  ctx: HostContext,
  run: QueueRun,
  state: { next?: string[] },
) {
  if (state.next?.includes("tools")) return null;
  const appends = ctx.db.pendingAppends(ctx.sessionId);
  if (appends.length === 0) return null;
  for (const item of appends) {
    const userMessageId = ctx.db.startQueue(ctx.sessionId, item);
    run.items.push({ ...item, status: "running", userMessageId });
  }
  ctx.logger.info("已在节点边界追加输入", {
    queueIds: appends.map((item) => item.id),
  });
  return new Command({
    update: {
      messages: appends.map((item) => ({
        role: "user",
        content: item.content,
      })),
    },
    goto: "model_request",
  });
}

async function waitIfPaused(ctx: HostContext, run: QueueRun) {
  while (true) {
    if (ctx.signal.stopping) {
      setRunStatus(ctx, run, "paused");
      return false;
    }
    const control = ctx.db.control(ctx.sessionId);
    if (control === "pause_cancel") {
      setRunStatus(ctx, run, "paused");
      ctx.db.setControl(ctx.sessionId, "pause");
      ctx.signal.stopping = true;
      ctx.logger.warn("暂停状态收到 cancel，Host 已关闭", {
        queueId: run.items[0].id,
      });
      return false;
    }
    if (control === "cancel") {
      await cancelRun(ctx, run);
      throw new CanceledRun("运行已取消");
    }
    if (control === "running") {
      setRunStatus(ctx, run, "running");
      return true;
    }
    setRunStatus(ctx, run, "paused");
    ctx.logger.info("暂停中，等待 resume 或 cancel", {
      queueId: run.items[0].id,
    });
    await sleep(ctx.settings.host.pausePollMs);
  }
}

function finishRun(ctx: HostContext, run: QueueRun, messages: BaseMessage[]) {
  const last = messages.findLast((message) => message.type === "ai");
  const content = contentToText(last?.content);
  if (!content) throw new Error("模型没有生成可记录的最终文本");
  const lastItem = run.items.at(-1);
  if (!lastItem) throw new Error("运行没有可记录的队列项");
  ctx.db.appendAssistant(ctx.sessionId, lastItem.id, content);
  setRunStatus(ctx, run, "done");
  ctx.logger.info("队列完成", { queueId: lastItem.id, chars: content.length });
  if (ctx.settings.logging.streamTokens) process.stdout.write("\n");
}

async function cancelRun(ctx: HostContext, run: QueueRun) {
  setRunStatus(ctx, run, "canceled");
  ctx.db.setControl(ctx.sessionId, "running");
  await ctx.checkpointer.deleteThread(run.threadId);
  ctx.signal.stopping = true;
  ctx.logger.warn("队列已取消，Host 已关闭", { queueId: run.items[0].id });
}

function setRunStatus(
  ctx: HostContext,
  run: QueueRun,
  status: QueueItem["status"],
  error?: string,
) {
  for (const item of run.items) ctx.db.setQueueStatus(item.id, status, error);
}
