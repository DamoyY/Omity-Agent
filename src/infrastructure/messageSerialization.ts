import {
  mapChatMessagesToStoredMessages,
  mapStoredMessagesToChatMessages,
  type BaseMessage,
  type StoredMessage,
} from "@langchain/core/messages";

export interface MessageRow {
  message_json: string;
}

export interface MessageInsert {
  messageJson: string;
  queueId?: number;
}

export function messageInsert(
  message: BaseMessage,
  queueId?: number,
): MessageInsert {
  return {
    messageJson: JSON.stringify(firstStoredMessage(message)),
    queueId,
  };
}

export function messageRowsToChatMessages(rows: MessageRow[]): BaseMessage[] {
  return mapStoredMessagesToChatMessages(rows.map(rowToStoredMessage));
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
