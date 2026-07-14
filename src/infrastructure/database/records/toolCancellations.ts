import type { Database } from "bun:sqlite";
import { toolNotRunning } from "../../../errors";

export function requestToolCancellation(db: Database, sessionId: string, callId: string) {
  const running = db
    .query<{ found: number }, [string, string]>(
      `SELECT EXISTS(
        SELECT 1 FROM events e
        JOIN queue q ON q.id = e.queue_id
        WHERE e.session_id = ? AND e.kind = 'tool_started'
          AND e.payload_json = ? AND q.status = 'running'
      ) AS found`,
    )
    .get(sessionId, JSON.stringify(callId));
  if (running?.found !== 1) {
    throw toolNotRunning(callId);
  }
  db.query(
    `INSERT INTO tool_cancellations (session_id, call_id, requested_at)
     VALUES (?, ?, ?)
     ON CONFLICT (session_id, call_id)
     DO UPDATE SET requested_at = excluded.requested_at`,
  ).run(sessionId, callId, Date.now());
}
export function takeToolCancellation(db: Database, sessionId: string, callId: string) {
  return (
    db
      .query("DELETE FROM tool_cancellations WHERE session_id = ? AND call_id = ?")
      .run(sessionId, callId).changes > 0
  );
}
export function clearToolCancellations(db: Database, sessionId: string) {
  db.query("DELETE FROM tool_cancellations WHERE session_id = ?").run(sessionId);
}
