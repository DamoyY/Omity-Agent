import type { HostContext } from "./context";
import { processQueue } from "./queue";
import { sleep } from "./time";

export async function hostLoop(ctx: HostContext) {
  let lastIdle = 0;
  while (!ctx.signal.stopping) {
    const item = ctx.db.nextQueue(ctx.sessionId);
    if (!item) {
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
