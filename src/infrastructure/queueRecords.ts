import type { Database } from "bun:sqlite";
import { DomainError } from "../errors";
import type { QueueItem, QueueStatus } from "../types";
import { insertUserMessage } from "./messages";
import { toQueueItem, type QueueRow } from "./queueRows";

const queueSelect = `
  SELECT q.id, q.root_id, COALESCE(q.content, '') AS content,
    q.status, m.id AS user_message_id
  FROM queue q
  LEFT JOIN messages m ON m.queue_id = q.id`;

export function appendUserQueue(
  db: Database,
  sessionId: string,
  content: string,
) {
  db.query("DELETE FROM queue WHERE session_id = ? AND status = 'draft'").run(
    sessionId,
  );
  const activeRun = db
    .query<{ root_id: number }, [string]>(
      `SELECT root_id FROM queue
       WHERE session_id = ? AND root_id IS NOT NULL
         AND status IN ('pending', 'running', 'paused')
       ORDER BY root_id LIMIT 1`,
    )
    .get(sessionId);
  if (activeRun) return appendToRun(db, sessionId, activeRun.root_id, content);
  const result = db
    .query(
      "INSERT INTO queue (session_id, content, status) VALUES (?, ?, 'pending')",
    )
    .run(sessionId, content);
  const queueId = Number(result.lastInsertRowid);
  db.query("UPDATE queue SET root_id = ? WHERE id = ?").run(queueId, queueId);
  return queueId;
}

export function appendDraftQueue(
  db: Database,
  sessionId: string,
  content: string,
) {
  const result = db
    .query(
      "INSERT INTO queue (session_id, content, status) VALUES (?, ?, 'draft')",
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

export function consumedRunRows(
  db: Database,
  sessionId: string,
  runId: number | null,
): QueueItem[] {
  if (runId === null) return [];
  const query = db.prepare<QueueRow, [string, number]>(
    `${queueSelect}
     WHERE q.session_id = ? AND q.root_id = ?
       AND m.id IS NOT NULL
       AND q.status IN ('pending', 'running', 'paused')
     ORDER BY q.id`,
  );
  try {
    return query.all(sessionId, runId).map(toQueueItem);
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
      `UPDATE queue SET status = 'running'
       WHERE id = ? AND session_id = ?
         AND EXISTS (SELECT 1 FROM messages WHERE id = ? AND queue_id = queue.id)
         AND status IN ('pending', 'running', 'paused')`,
      [item.id, sessionId, item.userMessageId],
    );
    if (result.changes !== 1) {
      throw queueClaimConflict(item.id);
    }
    return item.userMessageId;
  }
  const messageId = insertUserMessage(db, sessionId, item.content, item.id);
  const result = db.run(
    `UPDATE queue SET status = 'running', content = NULL
     WHERE id = ? AND session_id = ?
       AND status IN ('pending', 'running', 'paused')
       AND content IS NOT NULL
       AND EXISTS (SELECT 1 FROM messages WHERE id = ? AND queue_id = queue.id)`,
    [item.id, sessionId, messageId],
  );
  if (result.changes !== 1) {
    throw queueClaimConflict(item.id);
  }
  return messageId;
}

function queueClaimConflict(queueId: number) {
  return new DomainError(
    "QUEUE_CLAIM_CONFLICT",
    `队列认领冲突：${queueId.toString()}`,
  );
}

export function setQueueStatusRecord(
  db: Database,
  queueId: number,
  status: QueueStatus,
  error?: string,
) {
  db.run("UPDATE queue SET status = ?, error = ? WHERE id = ?", [
    status,
    error ?? null,
    queueId,
  ]);
}

export function queueStatusRecord(db: Database, queueId: number) {
  const row = db
    .query<{ status: QueueStatus }, [number]>(
      "SELECT status FROM queue WHERE id = ?",
    )
    .get(queueId);
  if (!row) throw new Error(`队列不存在：${queueId.toString()}`);
  return row.status;
}

function appendToRun(
  db: Database,
  sessionId: string,
  rootId: number,
  content: string,
) {
  const result = db
    .query(
      "INSERT INTO queue (session_id, root_id, content, status) VALUES (?, ?, ?, 'pending')",
    )
    .run(sessionId, rootId, content);
  return Number(result.lastInsertRowid);
}
