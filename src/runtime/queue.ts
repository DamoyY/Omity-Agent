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
import {
  createStreamLogState,
  handleStreamEvent,
  recordToolExecutionStarted,
} from "./stream";
import { queueMessageId } from "../infrastructure/database/records/messages/history";
import { consumeBoundaryAppends } from "./appends";
import { captureError } from "../failures/details";

export async function processQueue(ctx: HostContext, item: QueueItem) {
  const end = ctx.logger.child(`队列 #${item.id.toString()}`);
  const resumed = ctx.db.consumedRunItems(ctx.sessionId, item.runId);
  const items = [item, ...resumed.filter(({ id }) => id !== item.id)].sort(
    (left, right) => left.id - right.id,
  ) as [QueueItem, ...QueueItem[]];
  const root = items.find(({ root }) => root) ?? item;
  const run: QueueRun = {
    items,
    threadId: `${ctx.sessionId}:${root.id.toString()}`,
  };
  try {
    if (!(await waitIfPaused(ctx, run))) return;
    for (const runItem of run.items) ctx.db.startQueue(ctx.sessionId, runItem);
    await runGraphUntilBoundary(ctx, run);
  } catch (error) {
    if (error instanceof CanceledRun) return;
    if (run.items.every(({ id }) => isTerminal(ctx.db.queueStatus(id)))) {
      throw error;
    }
    if (ctx.controller.signal.aborted) {
      setRunStatus(ctx, run, "paused");
      return;
    }
    const details = captureError(error);
    ctx.db.setControl(ctx.sessionId, "pause");
    setRunStatus(ctx, run, "paused", details);
    ctx.logger.error("队列异常，已暂停", { queueId: item.id, error: details });
  } finally {
    end();
  }
}

function isTerminal(status: QueueItem["status"]) {
  return status === "done" || status === "canceled";
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
    interruptBefore: ["model_request", "tools"] as ["model_request", "tools"],
    interruptAfter: ["request_model", "invoke_tool"] as never,
  };
  let modelNetworkRetry = 0;
  const streamLogState = createStreamLogState();
  while (!ctx.controller.signal.aborted) {
    try {
      const stream = await ctx.graph.stream(input, {
        ...config,
        signal: ctx.controller.signal,
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
          cancel: () => {
            cancelRun(ctx, run);
            return Promise.reject(new CanceledRun("运行已取消"));
          },
        },
      );
      if (!shouldRetry) return;
      continue;
    }
    const control = ctx.db.control(ctx.sessionId);
    if (control === "cancel") {
      cancelRun(ctx, run);
      return;
    }
    const state = readGraphState(await ctx.graph.getState(config));
    const messages = state.values.messages;
    if (messages.length > 0) {
      ctx.db.syncHistory(ctx.sessionId, messages);
      ctx.observer?.changed?.(ctx.sessionId);
      ctx.logger.debug("已持久化节点上下文", { messages: messages.length });
    }
    ctx.logger.debug("LangGraph 边界", {
      next: state.next,
      tasks: state.tasks.map((task) => task.name),
    });
    if (control === "pause" || control === "pause_cancel") {
      ctx.logger.warn("已在节点边界暂停", {
        queueId: item.id,
        next: state.next,
      });
      if (!(await waitIfPaused(ctx, run))) return;
    }
    const appendInput = consumeBoundaryAppends(ctx, run, state);
    if (appendInput) {
      input = appendInput;
      continue;
    }
    if (state.next.length === 0) {
      ctx.observer?.activity?.(ctx.sessionId, "idle");
      finishRun(ctx, run, state.values.messages, state.values.hookPlan);
      return;
    }
    const nextActivity = state.next.includes("tools")
      ? "tool"
      : state.next.includes("model_request")
        ? "model"
        : undefined;
    if (nextActivity) ctx.observer?.activity?.(ctx.sessionId, nextActivity);
    if (nextActivity === "tool")
      recordToolExecutionStarted(ctx, messages, item.id);
    input = null;
  }
}

async function waitIfPaused(ctx: HostContext, run: QueueRun) {
  let pauseLogged = false;
  for (;;) {
    if (ctx.controller.signal.aborted) {
      setRunStatus(ctx, run, "paused");
      return false;
    }
    const control = ctx.db.control(ctx.sessionId);
    if (control === "pause_cancel") {
      setRunStatus(ctx, run, "paused");
      ctx.db.setControl(ctx.sessionId, "pause");
      ctx.controller.abort(new CanceledRun("暂停状态收到 cancel"));
      ctx.logger.warn("暂停状态收到 cancel，Host 已关闭", {
        queueId: run.items[0].id,
      });
      return false;
    }
    if (control === "cancel") {
      cancelRun(ctx, run);
      throw new CanceledRun("运行已取消");
    }
    if (control === "running") {
      setRunStatus(ctx, run, "running");
      return true;
    }
    if (!pauseLogged) {
      setRunStatus(ctx, run, "paused");
      ctx.logger.info("暂停中，等待 resume 或 cancel", {
        queueId: run.items[0].id,
      });
      pauseLogged = true;
    }
    await waitForWake(ctx, ctx.settings.host.pausePollMs);
  }
}
