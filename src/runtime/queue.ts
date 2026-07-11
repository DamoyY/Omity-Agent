import type { QueueItem } from "../types";
import { readGraphState, waitForWake, type HostContext } from "./context";
import { isModelNetworkError } from "./network";
import { waitBeforeModelNetworkRetry } from "./retry";
import {
  CanceledRun,
  cancelRun,
  finishRun,
  setRunStatus,
  type QueueRun,
} from "./run";
import { createStreamLogState, handleStreamEvent } from "./stream";
import { queueMessageId } from "../infrastructure/messages";
import { consumeBoundaryAppends } from "./appends";

export async function processQueue(ctx: HostContext, item: QueueItem) {
  const end = ctx.logger.child(`队列 #${item.id.toString()}`);
  const run: QueueRun = {
    items: [item],
    threadId: `${ctx.sessionId}:${item.id.toString()}`,
  };
  try {
    if (!(await waitIfPaused(ctx, run))) return;
    ctx.db.startQueue(ctx.sessionId, item);
    ctx.observer?.changed?.(ctx.sessionId);
    await runGraphUntilBoundary(ctx, run);
  } catch (error) {
    if (error instanceof CanceledRun) return;
    const message = error instanceof Error ? error.message : String(error);
    setRunStatus(ctx, run, "paused", message);
    ctx.db.setControl(ctx.sessionId, "pause");
    ctx.observer?.changed?.(ctx.sessionId);
    ctx.logger.error("队列异常，已暂停", { queueId: item.id, error: message });
  } finally {
    end();
  }
}

async function runGraphUntilBoundary(ctx: HostContext, run: QueueRun) {
  const [item] = run.items;
  const checkpoint = await ctx.checkpointer.getTuple({
    configurable: { thread_id: run.threadId },
  });
  let input: Parameters<HostContext["graph"]["stream"]>[0] = checkpoint
    ? null
    : {
        messages: ctx.db.history(ctx.sessionId),
        hookPendingUserIds: [queueMessageId(ctx.sessionId, item.id)],
      };
  const config = {
    configurable: { thread_id: run.threadId },
    context: { sessionId: ctx.sessionId },
    recursionLimit: ctx.settings.host.recursionLimit,
    interruptAfter: ["model_request", "tools"],
  };
  let modelNetworkRetry = 0;
  const streamLogState = createStreamLogState();
  while (!ctx.signal.stopping) {
    try {
      const stream = await ctx.graph.stream(input, {
        ...config,
        streamMode: ["messages", "updates", "debug"],
      });
      for await (const event of stream)
        handleStreamEvent(ctx, event, streamLogState, item.id);
      modelNetworkRetry = 0;
    } catch (error) {
      if (!isModelNetworkError(error)) {
        throw error;
      }
      modelNetworkRetry += 1;
      const shouldRetry = await waitBeforeModelNetworkRetry(
        ctx,
        run,
        error,
        modelNetworkRetry,
        {
          stop: () => {
            setRunStatus(ctx, run, "paused");
          },
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
    const state = readGraphState(await ctx.graph.getState(config));
    const messages = state.values.messages;
    if (messages.length > 0) {
      ctx.db.syncHistory(ctx.sessionId, messages);
      ctx.logger.debug("已持久化节点上下文", { messages: messages.length });
    }
    ctx.logger.debug("LangGraph 边界", {
      next: state.next,
      tasks: state.tasks.map((task) => task.name),
    });
    if (control === "pause" || control === "pause_cancel") {
      setRunStatus(ctx, run, "paused");
      ctx.observer?.changed?.(ctx.sessionId);
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
    if (state.next.length === 0) {
      const finalMessages = state.values.messages;
      await ctx.hooks.runSilentChain(
        "agent",
        "after",
        `queue:${item.id.toString()}`,
        run.threadId,
        {
          previousInvocationKey: ctx.hooks.identity.last(
            finalMessages,
            run.threadId,
          ),
        },
      );
      finishRun(ctx, run, finalMessages);
      return;
    }
    input = null;
  }
}

async function waitIfPaused(ctx: HostContext, run: QueueRun) {
  let pauseLogged = false;
  for (;;) {
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
    if (!pauseLogged) {
      ctx.logger.info("暂停中，等待 resume 或 cancel", {
        queueId: run.items[0].id,
      });
      pauseLogged = true;
    }
    await waitForWake(ctx, ctx.settings.host.pausePollMs);
  }
}
