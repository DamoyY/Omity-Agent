import type { HostContext } from "./context";
import { processQueue } from "./queue";
import { sleep } from "./time";

export async function hostLoop(ctx: HostContext) {
  let lastIdle = 0;
  while (!ctx.signal.stopping) {
    const item = ctx.db.nextQueue(ctx.sessionId);
    if (!item) {
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
      await sleep(ctx.settings.host.pollMs);
      continue;
    }
    await processQueue(ctx, item);
  }
}
