import { AIMessage, HumanMessage, type BaseMessage } from "@langchain/core/messages";
import type { Database } from "bun:sqlite";
import { randomUUID } from "node:crypto";
import { messageRowsToChatMessages, type MessageRow } from "./serialization";
import { persistMessageBlob, pruneMessageBlobs } from "./blobStore";
const messageColumns = "b.message_json AS message_json, m.source_id AS source_id";
export function insertUserMessage(
  db: Database,
  sessionId: string,
  content: string,
  queueId: number,
) {
  return storeMessage(
    db,
    sessionId,
    new HumanMessage({ content, id: queueMessageId(sessionId, queueId) }),
    nextPosition(db, sessionId),
    queueId,
  );
}
export function queueMessageId(sessionId: string, queueId: number) {
  return `queue:${sessionId}:${queueId.toString()}`;
}
export function messageQueueId(sessionId: string, message: BaseMessage) {
  if (message.type !== "human" || !message.id) return undefined;
  const prefix = `queue:${sessionId}:`;
  if (!message.id.startsWith("queue:")) return undefined;
  if (!message.id.startsWith(prefix)) {
    throw new Error(`用户消息属于其他会话：${message.id}`);
  }
  const queueId = Number(message.id.slice(prefix.length));
  if (!Number.isSafeInteger(queueId) || queueId <= 0) {
    throw new Error(`用户消息 Queue ID 无效：${message.id}`);
  }
  return queueId;
}
export function appendAssistantMessage(db: Database, sessionId: string, content: string) {
  storeMessage(
    db,
    sessionId,
    new AIMessage({ content, id: randomUUID() }),
    nextPosition(db, sessionId),
  );
}
export function syncMessages(db: Database, sessionId: string, messages: BaseMessage[]) {
  for (const message of messages) message.id ??= randomUUID();
  const tx = db.transaction(() => {
    db.query("UPDATE messages SET position = NULL, queue_id = NULL WHERE session_id = ?").run(
      sessionId,
    );
    const ids = messages.map((message, position) =>
      storeMessage(db, sessionId, message, position, messageQueueId(sessionId, message)),
    );
    pruneUnreferencedMessages(db, sessionId);
    return ids;
  });
  return tx();
}
export function loadMessages(db: Database, sessionId: string): BaseMessage[] {
  const query = db.prepare<MessageRow, [string]>(
    `SELECT ${messageColumns} FROM messages m
     JOIN message_blobs b ON b.digest = m.blob_digest
     WHERE m.session_id = ? AND m.position IS NOT NULL ORDER BY m.position`,
  );
  let rows: MessageRow[];
  try {
    rows = query.all(sessionId);
  } finally {
    query.finalize();
  }
  return messageRowsToChatMessages(rows);
}
export function storeMessage(
  db: Database,
  sessionId: string,
  message: BaseMessage,
  position?: number,
  queueId?: number,
  createdAt?: number,
) {
  message.id ??= randomUUID();
  const ref = persistMessageBlob(db, message);
  db.query(
    `INSERT INTO messages
       (session_id, source_id, blob_digest, queue_id, position, created_at)
       VALUES (?, ?, ?, ?, ?, COALESCE(?, unixepoch()))
       ON CONFLICT(session_id, source_id, blob_digest) DO UPDATE SET
         queue_id = COALESCE(excluded.queue_id, messages.queue_id),
         position = COALESCE(excluded.position, messages.position)`,
  ).run(sessionId, ref.sourceId, ref.digest, queueId ?? null, position ?? null, createdAt ?? null);
  const row = db
    .query<{ id: number }, [string, string, string]>(
      `SELECT id FROM messages
       WHERE session_id = ? AND source_id = ? AND blob_digest = ?`,
    )
    .get(sessionId, ref.sourceId, ref.digest);
  if (!row) throw new Error(`消息写入失败：${ref.sourceId}`);
  return row.id;
}
export function pruneUnreferencedMessages(db: Database, sessionId: string) {
  db.run(
    `DELETE FROM messages
     WHERE session_id = ? AND position IS NULL`,
    [sessionId],
  );
  pruneMessageBlobs(db);
}
function nextPosition(db: Database, sessionId: string) {
  const row = db
    .query<{ position: number }, [string]>(
      "SELECT COALESCE(MAX(position), -1) + 1 AS position FROM messages WHERE session_id = ?",
    )
    .get(sessionId);
  if (!row) throw new Error("无法分配消息位置");
  return row.position;
}
