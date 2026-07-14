import { type HostContext, waitForWake } from "./context";
import type { QueueItem } from "../types";
import { captureError } from "../failures/details";
import { modelNetworkRetryDelayMs } from "./network";
interface RetriedRun {
  items: [QueueItem, ...QueueItem[]];
}
interface RetryControls {
  pause: () => Promise<boolean>;
  stop: () => void;
  cancel: () => Promise<void>;
}
export async function waitBeforeModelNetworkRetry(
  ctx: HostContext,
  run: RetriedRun,
  error: unknown,
  attempt: number,
  controls: RetryControls,
) {
  const delayMs = modelNetworkRetryDelayMs(attempt);
  console.warn("模型 API 网络异常，将继续重试", {
    attempt,
    delayMs,
    error: captureError(error),
    queueId: run.items[0].id,
  });
  const deadline = Date.now() + delayMs;
  while (Date.now() < deadline) {
    if (ctx.controller.signal.aborted || ctx.stopping?.aborted) {
      controls.stop();
      return false;
    }
    const control = ctx.db.control(ctx.sessionId);
    if (control === "cancel") {
      await controls.cancel();
      return false;
    }
    if (control === "pause" || control === "pause_cancel") {
      return controls.pause();
    }
    await waitForWake(ctx, Math.min(250, deadline - Date.now()));
  }
  return true;
}
