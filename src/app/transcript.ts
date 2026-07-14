import {
  type BaseMessage,
  type StoredMessage,
  ToolMessage,
  mapStoredMessagesToChatMessages,
} from "@langchain/core/messages";
import { type DisplayMessage, type DisplayToolCall } from "./timeline";
import { contentToText, messageReasoning } from "../runtime/content";
import { freeformCallIds, rawFreeformInput } from "./timeline/freeform";
import { modelTokenUsage, toolInputTokens, toolOutputTokens } from "./timeline/tokenCounts";
import { AgentDatabase } from "../infrastructure/database/agentDatabase";
import type { Settings } from "../types";
import { existsSync } from "node:fs";
import { extractToolImages } from "../runtime/modelImages";
import { parseError } from "../failures/details";
import { resolveSessionPaths } from "../infrastructure/configuration/sessionPaths";
import { sessionNotFound } from "../errors";
import { z } from "zod";
interface MessageRow {
  id: number;
  source_id: string;
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
  root_id: number | null;
}
import { persistedDisplayEvent, type PersistedEventRow } from "./timeline/persistedEvent";
interface SequenceRow {
  seq: number;
}
const storedMessageSchema = z.looseObject({
  data: z.record(z.string(), z.unknown()),
  type: z.string(),
});
export function loadSessionTranscript(settings: Settings, sessionId: string) {
  const paths = resolveSessionPaths(settings, sessionId);
  if (!existsSync(paths.dbPath)) {
    throw sessionNotFound(sessionId);
  }
  const db = new AgentDatabase(paths.dbPath);
  try {
    return loadTranscript(db, sessionId);
  } finally {
    db.close();
  }
}
export function loadTranscript(db: AgentDatabase, sessionId: string) {
  const control = db.control(sessionId);
  const messages = db.db
    .query<MessageRow, [string]>(
      `SELECT m.id, m.source_id, b.message_json, m.queue_id, m.created_at
       FROM messages m JOIN message_blobs b ON b.digest = m.blob_digest
       WHERE m.session_id = ? AND m.position IS NOT NULL
       ORDER BY m.position`,
    )
    .all(sessionId)
    .map(toDisplayMessage);
  const queue = db.db
    .query<QueueRow, [string]>(
      `SELECT q.id, COALESCE(q.content, '') AS content, q.status, q.error,
         m.id AS user_message_id, q.root_id
       FROM queue q
       LEFT JOIN messages m ON m.queue_id = q.id
       WHERE q.session_id = ? ORDER BY q.id`,
    )
    .all(sessionId)
    .map((row) => ({
      content: row.content,
      error: row.error ? parseError(row.error) : null,
      id: row.id,
      root: row.root_id === row.id,
      status: row.status,
      userMessageId: row.user_message_id,
    }));
  const events = db.db
    .query<PersistedEventRow, [string]>(
      `SELECT id, queue_id, message_id, kind, payload_json
       FROM events WHERE session_id = ? ORDER BY id`,
    )
    .all(sessionId)
    .map(persistedDisplayEvent);
  const eventCursor =
    db.db.query<SequenceRow, []>("SELECT seq FROM sqlite_sequence WHERE name = 'events'").get()
      ?.seq ?? 0;
  if (!Number.isSafeInteger(eventCursor)) {
    throw new Error(`流式事件游标超出安全整数范围：${String(eventCursor)}`);
  }
  return { control, eventCursor, events, messages, queue };
}
function toDisplayMessage(row: MessageRow): DisplayMessage {
  const stored = parseStored(row.message_json);
  stored.data.id = row.source_id;
  const [message] = mapStoredMessagesToChatMessages([stored]);
  if (!message) {
    throw new Error("无法还原消息");
  }
  const role = messageRole(message);
  const content = contentToText(message.content);
  if (role === "tool" && !ToolMessage.isInstance(message)) {
    throw new Error("工具消息类型无效");
  }
  return {
    id: row.id,
    ...(message.id ? { sourceId: message.id } : {}),
    content,
    images: extractToolImages(message.content),
    queueId: row.queue_id,
    reasoning: messageReasoning(message),
    role,
    toolCallId: extractToolCallId(message),
    toolCalls: extractToolCalls(message),
    ...(ToolMessage.isInstance(message)
      ? { outputTokens: toolOutputTokens(message, content) }
      : {}),
    createdAt: row.created_at,
    usage: modelTokenUsage(message),
  };
}
function parseStored(value: string): StoredMessage {
  const parsed: unknown = JSON.parse(value);
  const result = storedMessageSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error("消息记录无效");
  }
  return result.data as unknown as StoredMessage;
}
function messageRole(message: BaseMessage): DisplayMessage["role"] {
  if (message.type === "human") {
    return "user";
  }
  if (message.type === "tool") {
    return "tool";
  }
  return "assistant";
}
function extractToolCalls(message: BaseMessage): DisplayToolCall[] {
  const calls = readRecordArray(message, "tool_calls");
  const freeformIds = freeformCallIds(message);
  return calls.map((call, index) => {
    const input = call["args"] ?? call["input"] ?? call;
    const id = stringField(call, "id") ?? `tool-${index.toString()}`;
    const freeform = call["isCustomTool"] === true || freeformIds.has(id);
    return {
      id,
      index,
      inputTokens: toolInputTokens(call, input),
      ...(message.id ? { messageId: message.id } : {}),
      input,
      name: stringField(call, "name") ?? "tool",
      ...(freeform ? { rawInput: rawFreeformInput(input) } : {}),
    };
  });
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
