import { CanceledRunError, type QueueRun, cancelRun, finishRun, setRunStatus } from "./run";
import { type HostContext, readGraphState, streamGraphWithTaskInterrupts } from "./context";
import { consumeBoundaryAppends, recoverConsumedAppends } from "./appends";
import { createStreamLogState, handleStreamEvent, recordToolExecutionStarted } from "./stream";
import { pauseForStop, waitIfPaused } from "./execution/pause";
import { HostLeaseLostError } from "./execution/lease";
import type { QueueItem } from "../types";
import { captureError } from "../failures/details";
import { isModelNetworkError } from "./network";
import { queueMessageId } from "../infrastructure/database/records/messages/history";
import { waitBeforeModelNetworkRetry } from "./retry";

export async function processQueue(ctx: HostContext, item: QueueItem) {
  const end = ctx.logger.child(`队列 #${item.id.toString()}`);
  const resumed = ctx.db.consumedRunItems(ctx.sessionId, item.runId);
  const items: [QueueItem, ...QueueItem[]] = [item, ...resumed.filter(({ id }) => id !== item.id)];
  items.sort((left, right) => left.id - right.id);
  const root = items.find(({ root: isRoot }) => isRoot) ?? item;
  const run: QueueRun = {
    items,
    rootId: root.id,
    threadId: `${ctx.sessionId}:${root.id.toString()}`,
  };
  try {
    ctx.assertLease?.();
    if (pauseForStop(ctx, run)) {
      return;
    }
    if (!(await waitIfPaused(ctx, run))) {
      return;
    }
    if (pauseForStop(ctx, run)) {
      return;
    }
    for (const runItem of run.items) {
      ctx.db.startQueue(ctx.sessionId, runItem);
    }
    if (pauseForStop(ctx, run)) {
      return;
    }
    await runGraphUntilBoundary(ctx, run);
  } catch (error) {
    if (error instanceof CanceledRunError) {
      return;
    }
    if (error instanceof HostLeaseLostError) {
      throw error;
    }
    ctx.assertLease?.();
    if (run.items.every(({ id }) => isTerminal(ctx.db.queueStatus(id)))) {
      throw error;
    }
    if (ctx.controller.signal.aborted || ctx.stopping?.aborted) {
      setRunStatus(ctx, run, "paused");
      return;
    }
    const details = captureError(error);
    setRunStatus(ctx, run, "paused", details);
    ctx.logger.error("队列异常，已暂停", { error: details, queueId: item.id });
  } finally {
    end();
  }
}
function isTerminal(status: QueueItem["status"]) {
  return status === "done" || status === "canceled";
}
async function runGraphUntilBoundary(ctx: HostContext, run: QueueRun) {
  const [item] = run.items;
  const config = {
    configurable: { thread_id: run.threadId },
    context: { sessionId: ctx.sessionId },
    interruptAfter: ["request_model", "invoke_tool"],
    interruptBefore: ["model_request", "tools"] as ["model_request", "tools"],
    recursionLimit: ctx.settings.host.recursionLimit,
  };
  const checkpoint = await ctx.checkpointer.getTuple(config);
  let input: Parameters<HostContext["graph"]["stream"]>[0];
  if (checkpoint) {
    const state = readGraphState(await ctx.graph.getState(config));
    input = recoverConsumedAppends(ctx, run, state);
  } else {
    input = {
      hookPendingUserIds: [queueMessageId(ctx.sessionId, item.id)],
      messages: ctx.db.history(ctx.sessionId),
    };
  }
  let modelNetworkRetry = 0;
  const streamLogState = createStreamLogState();
  for (;;) {
    ctx.assertLease?.();
    if (pauseForStop(ctx, run)) {
      return;
    }
    let reachedBoundary = false;
    try {
      const stream = await streamGraphWithTaskInterrupts(ctx.graph, input, {
        ...config,
        signal: ctx.controller.signal,
        streamMode: ["messages", "updates", "debug"],
      });
      for await (const event of stream) {
        handleStreamEvent(ctx, event, streamLogState, item.id);
      }
      modelNetworkRetry = 0;
      reachedBoundary = true;
    } catch (error) {
      if (!isModelNetworkError(error)) {
        throw error;
      }
      modelNetworkRetry += 1;
      const shouldRetry = await waitBeforeModelNetworkRetry(ctx, run, error, modelNetworkRetry, {
        cancel: () => {
          cancelRun(ctx, run);
          return Promise.reject(new CanceledRunError("运行已取消"));
        },
        pause: async () => {
          setRunStatus(ctx, run, "paused");
          return waitIfPaused(ctx, run);
        },
        stop: () => {
          setRunStatus(ctx, run, "paused");
        },
      });
      if (!shouldRetry) {
        return;
      }
    }
    if (reachedBoundary) {
      ctx.assertLease?.();
      if (pauseForStop(ctx, run)) {
        return;
      }
      const control = ctx.db.control(ctx.sessionId);
      if (control === "cancel") {
        cancelRun(ctx, run);
        return;
      }
      const state = readGraphState(await ctx.graph.getState(config));
      const { messages } = state.values;
      if (messages.length > 0) {
        ctx.db.syncHistory(ctx.sessionId, messages);
        ctx.observer?.changed?.(ctx.sessionId);
        ctx.logger.debug("已持久化节点上下文", { messages: messages.length });
      }
      ctx.logger.debug("LangGraph 边界", {
        next: state.next,
        tasks: state.tasks.map((task) => task.name),
      });
      if (ctx.stopping?.aborted) {
        setRunStatus(ctx, run, "paused");
        return;
      }
      if (control === "pause" || control === "pause_cancel") {
        ctx.logger.warn("已在节点边界暂停", {
          next: state.next,
          queueId: item.id,
        });
        if (!(await waitIfPaused(ctx, run))) {
          return;
        }
      }
      const appendInput = consumeBoundaryAppends(ctx, run, state);
      if (appendInput) {
        input = appendInput;
      } else if (state.next.length === 0) {
        ctx.observer?.activity?.(ctx.sessionId, "idle");
        finishRun(ctx, run, state.values.messages, state.values.hookPlan);
        return;
      } else {
        const nextActivity = state.next.includes("tools")
          ? "tool"
          : (state.next.includes("model_request")
            ? "model"
            : undefined);
        if (nextActivity) {
          ctx.observer?.activity?.(ctx.sessionId, nextActivity);
        }
        if (nextActivity === "tool") {
          recordToolExecutionStarted(ctx, messages, item.id);
        }
        input = null;
      }
    }
  }
}
