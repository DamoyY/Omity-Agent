import type { SessionInfo } from "../client";
export function reportSessionErrors(sessions: SessionInfo[], reported: Set<string>) {
  const current = new Set<string>();
  for (const session of sessions) {
    if (!session.error) continue;
    const identity = `${session.id}:${JSON.stringify(session.error)}`;
    current.add(identity);
    if (reported.has(identity)) continue;
    reported.add(identity);
    console.error(session.error.message, {
      sessionId: session.id,
      error: session.error,
    });
  }
  for (const identity of reported) {
    if (!current.has(identity)) reported.delete(identity);
  }
}
