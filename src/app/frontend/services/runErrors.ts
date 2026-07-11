import type { DisplayQueue } from "../../timeline";

export function reportPausedRunErrors(
  sessionId: string,
  queue: DisplayQueue[],
  reported: Set<string>,
  message: string,
) {
  for (const item of queue) {
    if (item.status !== "paused" || !item.error) continue;
    const identity = `${item.id.toString()}:${item.error}`;
    if (reported.has(identity)) continue;
    reported.add(identity);
    console.error(message, {
      sessionId,
      queueId: item.id,
      error: item.error,
    });
  }
}
