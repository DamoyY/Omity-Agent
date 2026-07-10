import {
  AIMessage,
  HumanMessage,
  mapChatMessagesToStoredMessages,
  mapStoredMessagesToChatMessages,
  type BaseMessage,
  type StoredMessage,
} from "@langchain/core/messages";
import type { Database } from "bun:sqlite";

export type MessageRow = {
  message_json: string;
};

export type MessageInsert = {
  messageJson: string;
  queueId?: number;
};

export type ReplaceMessagesOptions = {
  clearStreamEvents?: boolean;
  queueIds?: number[];
};

export function messageInsert(
  message: BaseMessage,
  queueId?: number,
): MessageInsert {
  return {
    messageJson: JSON.stringify(firstStoredMessage(message)),
    queueId,
  };
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
    messageInsert(new HumanMessage(content), queueId),
  );
}

export function appendAssistantMessage(
  db: Database,
  sessionId: string,
  queueId: number,
  content: string,
) {
  insertMessage(db, sessionId, messageInsert(new AIMessage(content), queueId));
}

export function replaceMessages(
  db: Database,
  sessionId: string,
  messages: BaseMessage[],
  options: ReplaceMessagesOptions = {},
) {
  let humanIndex = 0;
  const items = messages.map((message) => {
    const queueId =
      message.type === "human" ? options.queueIds?.[humanIndex++] : undefined;
    return messageInsert(message, queueId);
  });
  const insert = db.query(
    "INSERT INTO messages (session_id, message_json, queue_id, created_at) VALUES (?, ?, ?, unixepoch())",
  );
  const tx = db.transaction((persisted: MessageInsert[]) => {
    db.query("DELETE FROM messages WHERE session_id = ?").run(sessionId);
    for (const item of persisted) {
      insert.run(sessionId, item.messageJson, item.queueId ?? null);
    }
    if (options.clearStreamEvents) {
      db.query(
        "DELETE FROM events WHERE session_id = ? AND category = 'stream'",
      ).run(sessionId);
    }
  });
  tx(items);
}

export function loadMessages(db: Database, sessionId: string): BaseMessage[] {
  const rows = db
    .query<
      MessageRow,
      [string]
    >("SELECT message_json FROM messages WHERE session_id = ? ORDER BY id")
    .all(sessionId);
  return messageRowsToChatMessages(rows);
}

export function messageRowsToChatMessages(rows: MessageRow[]): BaseMessage[] {
  return mapStoredMessagesToChatMessages(rows.map(rowToStoredMessage));
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

function rowToStoredMessage(row: MessageRow): StoredMessage {
  const parsed = JSON.parse(row.message_json) as unknown;
  if (!isStoredMessage(parsed)) {
    throw new Error("messages.message_json 不是有效的 LangChain StoredMessage");
  }
  return parsed;
}

function firstStoredMessage(message: BaseMessage): StoredMessage {
  const [stored] = mapChatMessagesToStoredMessages([message]);
  if (!stored) throw new Error("无法序列化 LangChain 消息");
  return stored;
}

function isStoredMessage(value: unknown): value is StoredMessage {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    "data" in value
  );
}
