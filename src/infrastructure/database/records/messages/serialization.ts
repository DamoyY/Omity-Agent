import {
  mapChatMessagesToStoredMessages,
  mapStoredMessagesToChatMessages,
  type BaseMessage,
  type StoredMessage,
} from "@langchain/core/messages";

export interface MessageRow {
  message_json: string;
  source_id?: string;
}

export interface MessageInsert {
  messageJson: string;
  sourceId: string;
  queueId?: number;
}

export function messageInsert(
  message: BaseMessage,
  queueId?: number,
): MessageInsert {
  if (!message.id) throw new Error("LangChain 消息缺少持久化 ID");
  return {
    messageJson: JSON.stringify(withoutMessageId(firstStoredMessage(message))),
    sourceId: message.id,
    queueId,
  };
}

export function messageRowsToChatMessages(rows: MessageRow[]): BaseMessage[] {
  return mapStoredMessagesToChatMessages(rows.map(rowToStoredMessage));
}

function rowToStoredMessage(row: MessageRow): StoredMessage {
  const parsed = JSON.parse(row.message_json) as unknown;
  if (!isStoredMessage(parsed)) {
    throw new Error(
      "message_blobs.message_json 不是有效的 LangChain StoredMessage",
    );
  }
  if (row.source_id !== undefined) parsed.data.id = row.source_id;
  return parsed;
}

function firstStoredMessage(message: BaseMessage): StoredMessage {
  const [stored] = mapChatMessagesToStoredMessages([message]);
  if (!stored) throw new Error("无法序列化 LangChain 消息");
  return stored;
}

function withoutMessageId(message: StoredMessage): StoredMessage {
  const data = { ...message.data };
  delete data.id;
  return { ...message, data };
}

function isStoredMessage(value: unknown): value is StoredMessage {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    "data" in value &&
    typeof value.data === "object" &&
    value.data !== null
  );
}
