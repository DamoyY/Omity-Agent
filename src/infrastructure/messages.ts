import {
  AIMessage,
  HumanMessage,
  type BaseMessage,
} from "@langchain/core/messages";
import type { Database } from "bun:sqlite";
import {
  messageInsert,
  messageRowsToChatMessages,
  type MessageInsert,
  type MessageRow,
} from "./messageSerialization";

interface PersistedMessageRow extends MessageRow {
  id: number;
  queue_id: number | null;
}

export interface SyncMessagesOptions {
  clearStreamEvents?: boolean;
}

export function insertUserMessage(
  db: Database,
  sessionId: string,
  content: string,
  queueId: number,
) {
  return insertMessage(
    db,
    sessionId,
    messageInsert(
      new HumanMessage({ content, id: queueMessageId(sessionId, queueId) }),
      queueId,
    ),
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

export function appendAssistantMessage(
  db: Database,
  sessionId: string,
  queueId: number,
  content: string,
) {
  insertMessage(db, sessionId, messageInsert(new AIMessage(content), queueId));
}

export function syncMessages(
  db: Database,
  sessionId: string,
  messages: BaseMessage[],
  options: SyncMessagesOptions = {},
) {
  const items = messages.map((message) =>
    messageInsert(message, messageQueueId(sessionId, message)),
  );
  const insert = db.prepare(
    "INSERT INTO messages (session_id, message_json, queue_id, created_at) VALUES (?, ?, ?, unixepoch())",
  );
  const select = db.prepare<PersistedMessageRow, [string]>(
    "SELECT id, message_json, queue_id FROM messages WHERE session_id = ? ORDER BY id",
  );
  const updateQueue = db.prepare(
    "UPDATE queue SET user_message_id = ? WHERE session_id = ? AND id = ?",
  );
  const tx = db.transaction((persisted: MessageInsert[]) => {
    const existing = select.all(sessionId);
    const retained = commonPrefixLength(existing, persisted);
    const firstRemoved = existing[retained];
    if (firstRemoved) {
      db.query(
        `UPDATE queue SET user_message_id = NULL
         WHERE session_id = ? AND user_message_id IN (
           SELECT id FROM messages WHERE session_id = ? AND id >= ?
         )`,
      ).run(sessionId, sessionId, firstRemoved.id);
      db.query("DELETE FROM messages WHERE session_id = ? AND id >= ?").run(
        sessionId,
        firstRemoved.id,
      );
    }
    for (const item of persisted.slice(retained)) {
      const result = insert.run(
        sessionId,
        item.messageJson,
        item.queueId ?? null,
      );
      if (item.queueId !== undefined) {
        updateQueue.run(
          Number(result.lastInsertRowid),
          sessionId,
          item.queueId,
        );
      }
    }
    if (options.clearStreamEvents) {
      db.query(
        "DELETE FROM events WHERE session_id = ? AND category = 'stream'",
      ).run(sessionId);
    }
  });
  try {
    tx(items);
  } finally {
    updateQueue.finalize();
    select.finalize();
    insert.finalize();
  }
}

function commonPrefixLength(
  existing: PersistedMessageRow[],
  incoming: MessageInsert[],
) {
  const length = Math.min(existing.length, incoming.length);
  let index = 0;
  while (index < length) {
    const row = existing[index];
    const item = incoming[index];
    if (row === undefined || item === undefined) {
      throw new Error("消息公共前缀索引越界");
    }
    if (
      row.message_json !== item.messageJson ||
      row.queue_id !== (item.queueId ?? null)
    ) {
      break;
    }
    index++;
  }
  return index;
}

export function loadMessages(db: Database, sessionId: string): BaseMessage[] {
  const query = db.prepare<MessageRow, [string]>(
    "SELECT message_json FROM messages WHERE session_id = ? ORDER BY id",
  );
  let rows: MessageRow[];
  try {
    rows = query.all(sessionId);
  } finally {
    query.finalize();
  }
  return messageRowsToChatMessages(rows);
}

function insertMessage(
  db: Database,
  sessionId: string,
  message: MessageInsert,
) {
  const result = db
    .query(
      "INSERT INTO messages (session_id, message_json, queue_id, created_at) VALUES (?, ?, ?, unixepoch())",
    )
    .run(sessionId, message.messageJson, message.queueId ?? null);
  return Number(result.lastInsertRowid);
}
