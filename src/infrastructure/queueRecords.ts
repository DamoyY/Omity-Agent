import type { Database } from "bun:sqlite";
import type { QueueItem, QueueStatus } from "../types";
import { insertUserMessage } from "./messages";
import { toQueueItem, type QueueRow } from "./queueRows";
import { writeControlRecord } from "./sessionRecords";

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
    .query<
      { id: number },
      [string]
    >("SELECT id FROM runs WHERE session_id = ? AND status IN ('pending', 'running', 'paused') ORDER BY id LIMIT 1")
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

export function appendForkPauseQueue(
  db: Database,
  sessionId: string,
  content: string,
) {
  const queueId = appendUserQueue(db, sessionId, content);
  setQueueStatusRecord(db, queueId, "paused");
  writeControlRecord(db, sessionId, "pause");
  return queueId;
}

export function pendingAppendRows(
  db: Database,
  sessionId: string,
): QueueItem[] {
  return db
    .query<QueueRow, [string]>(
      `${queueSelect}
      WHERE q.session_id = ? AND q.status = 'pending' ORDER BY q.id`,
    )
    .all(sessionId)
    .map(toQueueItem);
}

export function nextQueueRow(
  db: Database,
  sessionId: string,
): QueueItem | null {
  const row = db
    .query<QueueRow, [string]>(
      `${queueSelect}
      WHERE q.session_id = ? AND q.status IN ('pending', 'running', 'paused')
      ORDER BY q.id LIMIT 1`,
    )
    .get(sessionId);
  return row ? toQueueItem(row) : null;
}

export function startQueueRecord(
  db: Database,
  sessionId: string,
  item: QueueItem,
) {
  if (item.userMessageId !== null) {
    setQueueStatusRecord(db, item.id, "running");
    return item.userMessageId;
  }
  const messageId = insertUserMessage(db, sessionId, item.content, item.id);
  db.query(
    "UPDATE queue SET status = 'running', started_at = unixepoch(), user_message_id = ? WHERE id = ?",
  ).run(messageId, item.id);
  return messageId;
}

export function setQueueStatusRecord(
  db: Database,
  queueId: number,
  status: QueueStatus,
  error?: string,
) {
  db.query(
    "UPDATE queue SET status = ?, error = ?, updated_at = unixepoch() WHERE id = ?",
  ).run(status, error ?? null, queueId);
  syncRunStatus(db, queueId, status);
}

export function runRootQueueIds(db: Database, queueIds: number[]) {
  if (queueIds.length === 0) return [];
  const placeholders = queueIds.map(() => "?").join(", ");
  return db
    .query<{ root_queue_id: number }, number[]>(
      `SELECT DISTINCT r.root_queue_id FROM queue q
       JOIN runs r ON r.id = q.run_id
       WHERE q.id IN (${placeholders}) ORDER BY r.root_queue_id`,
    )
    .all(...queueIds)
    .map((row) => row.root_queue_id);
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

function syncRunStatus(db: Database, queueId: number, status: QueueStatus) {
  const row = db
    .query<
      { run_id: number | null },
      [number]
    >("SELECT run_id FROM queue WHERE id = ?")
    .get(queueId);
  if (row?.run_id === null || row?.run_id === undefined) return;
  db.query(
    "UPDATE runs SET status = ?, updated_at = unixepoch() WHERE id = ?",
  ).run(status, row.run_id);
}
