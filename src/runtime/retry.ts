import { setTimeout as sleep } from "node:timers/promises";
import type { QueueItem } from "../types";
import type { HostContext } from "./context";
import { errorMessage, modelNetworkRetryDelayMs } from "./network";

type RetriedRun = {
  items: [QueueItem, ...QueueItem[]];
};

type RetryControls = {
  pause: () => Promise<boolean>;
  stop: () => void;
  cancel: () => Promise<void>;
};

export async function waitBeforeModelNetworkRetry(
  ctx: HostContext,
  run: RetriedRun,
  error: unknown,
  attempt: number,
  controls: RetryControls,
) {
  const delayMs = modelNetworkRetryDelayMs(attempt);
  ctx.logger.warn("模型 API 网络异常，将继续重试", {
    queueId: run.items[0].id,
    attempt,
    delayMs,
    error: errorMessage(error),
  });
  const deadline = Date.now() + delayMs;
  while (Date.now() < deadline) {
    if (ctx.signal.stopping) {
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
    await sleep(Math.min(250, deadline - Date.now()));
  }
  return true;
}
