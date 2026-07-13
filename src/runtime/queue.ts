import type { QueueItem } from "../types";
import { readGraphState, type HostContext } from "./context";
import { HostLeaseLostError } from "./execution/lease";
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
import { consumeBoundaryAppends, recoverConsumedAppends } from "./appends";
import { captureError } from "../failures/details";
import { pauseForStop, waitIfPaused } from "./execution/pause";

export async function processQueue(ctx: HostContext, item: QueueItem) {
  const end = ctx.logger.child(`队列 #${item.id.toString()}`);
  const resumed = ctx.db.consumedRunItems(ctx.sessionId, item.runId);
  const items = [item, ...resumed.filter(({ id }) => id !== item.id)].sort(
    (left, right) => left.id - right.id,
  ) as [QueueItem, ...QueueItem[]];
  const root = items.find(({ root }) => root) ?? item;
  const run: QueueRun = {
    items,
    rootId: root.id,
    threadId: `${ctx.sessionId}:${root.id.toString()}`,
  };
  try {
    ctx.assertLease?.();
    if (pauseForStop(ctx, run)) return;
    if (!(await waitIfPaused(ctx, run))) return;
    if (pauseForStop(ctx, run)) return;
    for (const runItem of run.items) ctx.db.startQueue(ctx.sessionId, runItem);
    if (pauseForStop(ctx, run)) return;
    await runGraphUntilBoundary(ctx, run);
  } catch (error) {
    if (error instanceof CanceledRun) return;
    if (error instanceof HostLeaseLostError) throw error;
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
  const config = {
    configurable: { thread_id: run.threadId },
    context: { sessionId: ctx.sessionId },
    recursionLimit: ctx.settings.host.recursionLimit,
    interruptBefore: ["model_request", "tools"] as ["model_request", "tools"],
    interruptAfter: ["request_model", "invoke_tool"] as never,
  };
  const checkpoint = await ctx.checkpointer.getTuple(config);
  let input: Parameters<HostContext["graph"]["stream"]>[0];
  if (checkpoint) {
    const state = readGraphState(await ctx.graph.getState(config));
    input = recoverConsumedAppends(ctx, run, state);
  } else {
    input = {
      messages: ctx.db.history(ctx.sessionId),
      hookPendingUserIds: [queueMessageId(ctx.sessionId, item.id)],
    };
  }
  let modelNetworkRetry = 0;
  const streamLogState = createStreamLogState();
  for (;;) {
    ctx.assertLease?.();
    if (pauseForStop(ctx, run)) return;
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
    ctx.assertLease?.();
    if (pauseForStop(ctx, run)) return;
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
    if (ctx.stopping?.aborted) {
      setRunStatus(ctx, run, "paused");
      return;
    }
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
