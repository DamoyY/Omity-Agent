import type { Database } from "bun:sqlite";
import type { QueueItem, QueueStatus } from "../types";
import { insertUserMessage } from "./messages";
import { toQueueItem, type QueueRow } from "./queueRows";

const queueSelect = `
  SELECT q.id, q.run_id, q.content, q.status, q.user_message_id,
    r.root_queue_id
  FROM queue q
  LEFT JOIN runs r ON r.id = q.run_id`;

export function appendUserQueue(
  db: Database,
  sessionId: string,
  content: string,
) {
  db.query("DELETE FROM queue WHERE session_id = ? AND status = 'draft'").run(
    sessionId,
  );
  const activeRun = db
    .query<{ id: number }, [string]>(
      "SELECT id FROM runs WHERE session_id = ? AND status IN ('pending', 'running', 'paused') ORDER BY id LIMIT 1",
    )
    .get(sessionId);
  if (activeRun) return appendToRun(db, sessionId, activeRun.id, content);
  const result = db
    .query(
      "INSERT INTO queue (session_id, content, status, created_at) VALUES (?, ?, 'pending', unixepoch())",
    )
    .run(sessionId, content);
  const queueId = Number(result.lastInsertRowid);
  const run = db
    .query(
      "INSERT INTO runs (session_id, root_queue_id, status, created_at) VALUES (?, ?, 'pending', unixepoch())",
    )
    .run(sessionId, queueId);
  db.query("UPDATE queue SET run_id = ? WHERE id = ?").run(
    Number(run.lastInsertRowid),
    queueId,
  );
  return queueId;
}

export function appendDraftQueue(
  db: Database,
  sessionId: string,
  content: string,
) {
  const result = db
    .query(
      "INSERT INTO queue (session_id, content, status, created_at) VALUES (?, ?, 'draft', unixepoch())",
    )
    .run(sessionId, content);
  return Number(result.lastInsertRowid);
}

export function pendingAppendRows(
  db: Database,
  sessionId: string,
): QueueItem[] {
  const query = db.prepare<QueueRow, [string]>(
    `${queueSelect}
     WHERE q.session_id = ? AND q.status = 'pending' ORDER BY q.id`,
  );
  try {
    return query.all(sessionId).map(toQueueItem);
  } finally {
    query.finalize();
  }
}

export function nextQueueRow(
  db: Database,
  sessionId: string,
): QueueItem | null {
  const query = db.prepare<QueueRow, [string]>(
    `${queueSelect}
     WHERE q.session_id = ? AND q.status IN ('pending', 'running', 'paused')
     ORDER BY q.id LIMIT 1`,
  );
  let row: QueueRow | null;
  try {
    row = query.get(sessionId);
  } finally {
    query.finalize();
  }
  return row ? toQueueItem(row) : null;
}

export function startQueueRecord(
  db: Database,
  sessionId: string,
  item: QueueItem,
) {
  if (item.userMessageId !== null) {
    const result = db.run(
      `UPDATE queue SET status = 'running', updated_at = unixepoch()
       WHERE id = ? AND session_id = ? AND status = ? AND user_message_id = ?`,
      [item.id, sessionId, item.status, item.userMessageId],
    );
    if (result.changes !== 1) throw new Error(`队列认领冲突：${item.id}`);
    syncRunStatus(db, item.id);
    return item.userMessageId;
  }
  const messageId = insertUserMessage(db, sessionId, item.content, item.id);
  const result = db.run(
    `UPDATE queue SET status = 'running', started_at = unixepoch(),
       updated_at = unixepoch(), user_message_id = ?
     WHERE id = ? AND session_id = ?
       AND status IN ('pending', 'running', 'paused')
       AND user_message_id IS NULL`,
    [messageId, item.id, sessionId],
  );
  if (result.changes !== 1) throw new Error(`队列认领冲突：${item.id}`);
  syncRunStatus(db, item.id);
  return messageId;
}

export function setQueueStatusRecord(
  db: Database,
  queueId: number,
  status: QueueStatus,
  error?: string,
) {
  db.run(
    "UPDATE queue SET status = ?, error = ?, updated_at = unixepoch() WHERE id = ?",
    [status, error ?? null, queueId],
  );
  syncRunStatus(db, queueId);
}

function appendToRun(
  db: Database,
  sessionId: string,
  runId: number,
  content: string,
) {
  const result = db
    .query(
      "INSERT INTO queue (session_id, run_id, content, status, created_at) VALUES (?, ?, ?, 'pending', unixepoch())",
    )
    .run(sessionId, runId, content);
  return Number(result.lastInsertRowid);
}

function syncRunStatus(db: Database, queueId: number) {
  db.run(
    `UPDATE runs SET status = CASE
       WHEN EXISTS (
         SELECT 1 FROM queue WHERE run_id = runs.id AND status = 'running'
       ) THEN 'running'
       WHEN EXISTS (
         SELECT 1 FROM queue WHERE run_id = runs.id AND status = 'paused'
       ) THEN 'paused'
       WHEN EXISTS (
         SELECT 1 FROM queue WHERE run_id = runs.id AND status = 'pending'
       ) THEN 'pending'
       WHEN EXISTS (
         SELECT 1 FROM queue WHERE run_id = runs.id AND status = 'canceled'
       ) THEN 'canceled'
       ELSE 'done'
     END, updated_at = unixepoch()
     WHERE id = (SELECT run_id FROM queue WHERE id = ?)`,
    [queueId],
  );
}
