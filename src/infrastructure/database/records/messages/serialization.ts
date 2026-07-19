import { type MessageStorageMode, encodeMessage } from "./payload";
import type { BaseMessage } from "@langchain/core/messages";
import { decodeMessage } from "./hydration";

export interface MessageRow {
  message_json: string;
  source_id?: string;
}
export interface MessageInsert {
  messageJson: string;
  sourceId: string;
}
export type { MessageStorageMode } from "./payload";
export function messageInsert(
  message: BaseMessage,
  mode: MessageStorageMode = "history",
): MessageInsert {
  if (!message.id) {
    throw new Error("LangChain 消息缺少持久化 ID");
  }
  return {
    messageJson: JSON.stringify(encodeMessage(message, mode)),
    sourceId: message.id,
  };
}
export function messageRowsToChatMessages(rows: MessageRow[]): BaseMessage[] {
  return rows.map((row) => decodeMessage(row.message_json, row.source_id));
}
