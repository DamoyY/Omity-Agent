import { waitForWake, type HostContext } from "./context";
import { processQueue } from "./queue";
export async function hostLoop(ctx: HostContext) {
  let lastIdle = 0;
  while (!ctx.controller.signal.aborted) {
    ctx.assertLease?.();
    const item = ctx.db.nextQueue(ctx.sessionId);
    if (ctx.stopping?.aborted) {
      if (item) await processQueue(ctx, item);
      return;
    }
    if (!item) {
      ctx.observer?.activity?.(ctx.sessionId, "idle");
      if (ctx.db.control(ctx.sessionId) === "pause_cancel") {
        ctx.db.setControl(ctx.sessionId, "pause");
        ctx.logger.warn("暂停状态收到 cancel，Host 已关闭", {
          sessionId: ctx.sessionId,
        });
        return;
      }
      if (ctx.db.control(ctx.sessionId) === "cancel") {
        ctx.db.setControl(ctx.sessionId, "running");
        ctx.logger.warn("收到 cancel，Host 已关闭", {
          sessionId: ctx.sessionId,
        });
        return;
      }
      const now = Date.now();
      if (now - lastIdle >= ctx.settings.host.idleLogMs) {
        ctx.logger.debug("等待 Client 输入", { sessionId: ctx.sessionId });
        lastIdle = now;
      }
      await waitForWake(ctx, ctx.settings.host.pollMs);
      continue;
    }
    ctx.observer?.activity?.(ctx.sessionId, "model");
    await processQueue(ctx, item);
  }
}
