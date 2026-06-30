import type { BaseMessage } from "@langchain/core/messages";
import type { QueueItem } from "../types";
import type { HostContext } from "./context";
import { contentToText } from "./content";
import { handleStreamEvent } from "./stream";
import { sleep } from "./time";

class CanceledRun extends Error {}

export async function processQueue(ctx: HostContext, item: QueueItem) {
  const end = ctx.logger.child(`队列 #${item.id}`);
  const threadId = `${ctx.sessionId}:${item.id}`;
  try {
    ctx.db.startQueue(ctx.sessionId, item);
    await waitIfPaused(ctx, item);
    await runGraphUntilBoundary(ctx, item, threadId);
  } catch (error) {
    if (error instanceof CanceledRun) return;
    const message = error instanceof Error ? error.message : String(error);
    ctx.db.setQueueStatus(item.id, "failed", message);
    ctx.logger.error("队列执行失败", { queueId: item.id, error: message });
  } finally {
    end();
  }
}

async function runGraphUntilBoundary(
  ctx: HostContext,
  item: QueueItem,
  threadId: string,
) {
  let input: unknown =
    item.status === "pending"
      ? { messages: ctx.db.history(ctx.sessionId) }
      : null;
  const config = {
    configurable: { thread_id: threadId },
    recursionLimit: ctx.settings.host.recursionLimit,
    interruptAfter: ["model_request", "tools"],
  };
  while (!ctx.signal.stopping) {
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
}

async function waitIfPaused(ctx: HostContext, item: QueueItem) {
  while (!ctx.signal.stopping) {
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
  const last = messages.findLast((message) => message.type === "ai");
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
