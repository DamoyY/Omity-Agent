import { type ErrorDetails, stringifyError } from "../../../../failures/details";
import { type QueueRow, toQueueItem } from "./rowMapping";
import type { Database } from "bun:sqlite";
import type { QueueItem } from "../../../../types";
import { requireSessionRecord } from "../sessions";
const activeStatuses = "('pending', 'running', 'paused')";
export function activeQueueRows(db: Database, sessionId: string): QueueItem[] {
  requireSessionRecord(db, sessionId);
  const query = db.prepare<QueueRow, [string]>(
    `SELECT q.id, q.root_id, COALESCE(q.content, '') AS content,
       q.status, m.id AS user_message_id
     FROM queue q
     LEFT JOIN messages m ON m.queue_id = q.id
     WHERE q.session_id = ? AND q.status IN ${activeStatuses}
     ORDER BY q.id`,
  );
  try {
    return query.all(sessionId).map(toQueueItem);
  } finally {
    query.finalize();
  }
}
export function pauseRunRecord(
  db: Database,
  sessionId: string,
  runId: number,
  error?: ErrorDetails,
) {
  requireSessionRecord(db, sessionId);
  if (error === undefined) {
    return db.run(
      `UPDATE queue SET status = 'paused'
       WHERE session_id = ? AND root_id = ?
         AND (status IN ('running', 'paused')
           OR (status = 'pending' AND id = root_id))`,
      [sessionId, runId],
    ).changes;
  }
  return db.run(
    `UPDATE queue SET status = 'paused', error = ?
     WHERE session_id = ? AND root_id = ?
       AND (status IN ('running', 'paused')
         OR (status = 'pending' AND id = root_id))`,
    [stringifyError(error), sessionId, runId],
  ).changes;
}
