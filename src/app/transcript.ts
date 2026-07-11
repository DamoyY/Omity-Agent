import type { BaseMessage } from "@langchain/core/messages";
import {
  mapStoredMessagesToChatMessages,
  type StoredMessage,
} from "@langchain/core/messages";
import { AgentDatabase } from "../infrastructure/database";
import { contentToText } from "../runtime/content";
import { extractToolImages } from "../runtime/modelImages";
import {
  buildTimeline,
  type DisplayEvent,
  type DisplayMessage,
  type DisplayToolCall,
} from "./timeline";

interface MessageRow {
  id: number;
  message_json: string;
  queue_id: number | null;
  created_at: number;
}

interface QueueRow {
  id: number;
  content: string;
  status: string;
  error: string | null;
  user_message_id: number | null;
  root_queue_id: number | null;
}

interface EventRow {
  id: number;
  message: string;
  payload_json: string;
}

export function loadTranscript(db: AgentDatabase, sessionId: string) {
  const control = db.control(sessionId);
  const messages = db.db
    .query<MessageRow, [string]>(
      "SELECT id, message_json, queue_id, created_at FROM messages WHERE session_id = ? ORDER BY id",
    )
    .all(sessionId)
    .map(toDisplayMessage);
  const queue = db.db
    .query<QueueRow, [string]>(
      `SELECT q.id, q.content, q.status, q.error, q.user_message_id,
        r.root_queue_id
       FROM queue q
       LEFT JOIN runs r ON r.id = q.run_id
       WHERE q.session_id = ? ORDER BY q.id`,
    )
    .all(sessionId)
    .map((row) => ({
      id: row.id,
      content: row.content,
      status: row.status,
      error: row.error,
      userMessageId: row.user_message_id,
      root: row.root_queue_id === row.id,
    }));
  const events = db.db
    .query<EventRow, [string]>(
      "SELECT id, message, payload_json FROM events WHERE session_id = ? AND category = 'stream' ORDER BY id",
    )
    .all(sessionId)
    .map(toDisplayEvent);
  return { control, queue, view: buildTimeline(messages, queue, events) };
}

function toDisplayMessage(row: MessageRow): DisplayMessage {
  const stored = parseStored(row.message_json);
  const [message] = mapStoredMessagesToChatMessages([stored]);
  if (!message) throw new Error("无法还原消息");
  return {
    id: row.id,
    ...(message.id ? { sourceId: message.id } : {}),
    role: messageRole(message),
    content: contentToText(message.content),
    images: extractToolImages(message.content),
    queueId: row.queue_id,
    toolCalls: extractToolCalls(message),
    toolCallId: extractToolCallId(message),
    createdAt: row.created_at,
  };
}

function toDisplayEvent(row: EventRow): DisplayEvent {
  return {
    id: row.id,
    message: row.message,
    payload: JSON.parse(row.payload_json) as unknown,
  };
}

function parseStored(value: string): StoredMessage {
  const parsed: unknown = JSON.parse(value);
  if (!isRecord(parsed) || typeof parsed["type"] !== "string") {
    throw new Error("消息记录无效");
  }
  return parsed as unknown as StoredMessage;
}

function messageRole(message: BaseMessage): DisplayMessage["role"] {
  if (message.type === "human") return "user";
  if (message.type === "tool") return "tool";
  return "assistant";
}

function extractToolCalls(message: BaseMessage): DisplayToolCall[] {
  const calls = readRecordArray(message, "tool_calls");
  return calls.map((call, index) => ({
    id: stringField(call, "id") ?? `tool-${index.toString()}`,
    index,
    ...(message.id ? { messageId: message.id } : {}),
    name: stringField(call, "name") ?? "tool",
    input: call["args"] ?? call["input"] ?? call,
  }));
}

function extractToolCallId(message: BaseMessage) {
  const value = readRecord(message, "tool_call_id");
  return typeof value === "string" ? value : undefined;
}

function readRecordArray(message: BaseMessage, key: string) {
  const value = (message as unknown as Record<string, unknown>)[key];
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function readRecord(message: BaseMessage, key: string) {
  return (message as unknown as Record<string, unknown>)[key];
}

function stringField(record: Record<string, unknown>, key: string) {
  return typeof record[key] === "string" ? record[key] : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
