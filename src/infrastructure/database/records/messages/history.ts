import { AIMessage, type BaseMessage, HumanMessage } from "@langchain/core/messages";
import { type MessageStorageMode, messageInsert, messageRowsToChatMessages } from "./serialization";
import { queryAll, queryGet } from "../../connection";
import type { Database } from "bun:sqlite";
import { randomUUID } from "node:crypto";

interface StoredRow {
  message_json: string;
  source_id: string;
}

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
  if (message.type !== "human" || !message.id) {
    return undefined;
  }
  const prefix = `queue:${sessionId}:`;
  if (!message.id.startsWith("queue:")) {
    return undefined;
  }
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

export function loadMessages(db: Database, sessionId: string): BaseMessage[] {
  const rows = queryAll<StoredRow>(
    db,
    `SELECT source_id, message_json FROM messages
     WHERE session_id = ? AND position IS NOT NULL ORDER BY position`,
    sessionId,
  );
  return messageRowsToChatMessages(rows);
}

export function loadMessageRows(db: Database, ids: number[]) {
  const select = db.prepare<StoredRow, [number]>(
    "SELECT source_id, message_json FROM messages WHERE id = ?",
  );
  try {
    return ids.map((id) => {
      const row = select.get(id);
      if (!row) {
        throw new Error(`待恢复消息不存在：${id.toString()}`);
      }
      return row;
    });
  } finally {
    select.finalize();
  }
}

export function loadMessageBySourceId(db: Database, sessionId: string, sourceId: string) {
  const row = queryGet<StoredRow>(
    db,
    "SELECT source_id, message_json FROM messages WHERE session_id = ? AND source_id = ?",
    sessionId,
    sourceId,
  );
  if (!row) {
    throw new Error(`消息不存在：${sourceId}`);
  }
  const [message] = messageRowsToChatMessages([row]);
  if (!message) {
    throw new Error(`消息无法还原：${sourceId}`);
  }
  return message;
}

export function storeMessage(
  db: Database,
  sessionId: string,
  message: BaseMessage,
  position?: number,
  queueId?: number,
  createdAt?: number,
  mode: MessageStorageMode = "history",
) {
  message.id ??= randomUUID();
  return storePreparedMessage(
    db,
    sessionId,
    messageInsert(message, mode),
    position,
    queueId,
    createdAt,
  );
}

export function pruneUnreferencedMessages(db: Database, sessionId?: string) {
  db.run(
    `DELETE FROM messages
     WHERE position IS NULL
       AND NOT EXISTS (
         SELECT 1 FROM write_messages WHERE write_messages.message_id = messages.id
       )
       AND (? IS NULL OR session_id = ?)`,
    [sessionId ?? null, sessionId ?? null],
  );
}

export function storePreparedMessage(
  db: Database,
  sessionId: string,
  item: ReturnType<typeof messageInsert>,
  position?: number,
  queueId?: number,
  createdAt?: number,
) {
  const row = queryGet<{ id: number }>(
    db,
    `INSERT INTO messages
       (session_id, source_id, message_json, queue_id, position, created_at)
     VALUES (?, ?, ?, ?, ?, COALESCE(?, unixepoch()))
     ON CONFLICT(session_id, source_id) DO UPDATE SET
       message_json = excluded.message_json,
       queue_id = COALESCE(excluded.queue_id, messages.queue_id),
       position = COALESCE(excluded.position, messages.position)
     RETURNING id`,
    sessionId,
    item.sourceId,
    item.messageJson,
    queueId ?? null,
    position ?? null,
    createdAt ?? null,
  );
  if (!row) {
    throw new Error(`消息写入失败：${item.sourceId}`);
  }
  return row.id;
}

function nextPosition(db: Database, sessionId: string) {
  const row = queryGet<{ position: number }>(
    db,
    "SELECT COALESCE(MAX(position), -1) + 1 AS position FROM messages WHERE session_id = ?",
    sessionId,
  );
  if (!row) {
    throw new Error("无法分配消息位置");
  }
  return row.position;
}
