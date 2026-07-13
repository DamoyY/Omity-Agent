import type { HostContext } from "../context";
import { waitForWake } from "../context";
import { CanceledRun, cancelRun, setRunStatus, type QueueRun } from "../run";

export function pauseForStop(ctx: HostContext, run: QueueRun) {
  if (!ctx.stopping?.aborted && !ctx.controller.signal.aborted) return false;
  setRunStatus(ctx, run, "paused");
  return true;
}

export async function waitIfPaused(ctx: HostContext, run: QueueRun) {
  let pauseLogged = false;
  for (;;) {
    if (pauseForStop(ctx, run)) return false;
    const control = ctx.db.control(ctx.sessionId);
    if (control === "pause_cancel") {
      setRunStatus(ctx, run, "paused");
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
