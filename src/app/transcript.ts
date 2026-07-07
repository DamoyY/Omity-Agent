import type { BaseMessage } from "@langchain/core/messages";
import {
  mapStoredMessagesToChatMessages,
  type StoredMessage,
} from "@langchain/core/messages";
import { AgentDatabase } from "../infrastructure/database";
import { contentToText } from "../runtime/content";

export type DisplayMessage = {
  id: number;
  role: "user" | "assistant" | "tool";
  content: string;
  queueId: number | null;
  toolCalls: DisplayToolCall[];
  toolCallId?: string;
  createdAt: number;
};

export type DisplayToolCall = {
  id: string;
  name: string;
  input: unknown;
};

export type DisplayQueue = {
  id: number;
  content: string;
  status: string;
  error: string | null;
};

export type DisplayEvent = {
  id: number;
  message: string;
  payload: unknown;
};

type MessageRow = {
  id: number;
  message_json: string;
  queue_id: number | null;
  created_at: number;
};

type QueueRow = {
  id: number;
  content: string;
  status: string;
  error: string | null;
};

type EventRow = {
  id: number;
  message: string;
  payload_json: string;
};

export function loadTranscript(db: AgentDatabase, sessionId: string) {
  const messages = db.db
    .query<
      MessageRow,
      [string]
    >("SELECT id, message_json, queue_id, created_at FROM messages WHERE session_id = ? ORDER BY id")
    .all(sessionId)
    .map(toDisplayMessage);
  const queue = db.db
    .query<
      QueueRow,
      [string]
    >("SELECT id, content, status, error FROM queue WHERE session_id = ? ORDER BY id")
    .all(sessionId);
  const events = db.db
    .query<
      EventRow,
      [string]
    >("SELECT id, message, payload_json FROM events WHERE session_id = ? AND category = 'stream' ORDER BY id")
    .all(sessionId)
    .map(toDisplayEvent);
  return { messages, queue, events };
}

function toDisplayMessage(row: MessageRow): DisplayMessage {
  const stored = parseStored(row.message_json);
  const [message] = mapStoredMessagesToChatMessages([stored]);
  if (!message) throw new Error("无法还原消息");
  return {
    id: row.id,
    role: messageRole(message),
    content: contentToText(message.content),
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
  const parsed = JSON.parse(value) as StoredMessage;
  if (!parsed || typeof parsed !== "object" || !("type" in parsed)) {
    throw new Error("消息记录无效");
  }
  return parsed;
}

function messageRole(message: BaseMessage): DisplayMessage["role"] {
  if (message.type === "human") return "user";
  if (message.type === "tool") return "tool";
  return "assistant";
}

function extractToolCalls(message: BaseMessage): DisplayToolCall[] {
  const calls = readRecordArray(message, "tool_calls");
  return calls.map((call, index) => ({
    id: stringField(call, "id") ?? `tool-${index}`,
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
