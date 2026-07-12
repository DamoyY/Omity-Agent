import {
  mapStoredMessagesToChatMessages,
  ToolMessage,
  type BaseMessage,
  type StoredMessage,
} from "@langchain/core/messages";
import { AgentDatabase } from "../infrastructure/database/agentDatabase";
import { contentToText, messageReasoning } from "../runtime/content";
import { extractToolImages } from "../runtime/modelImages";
import { parseError } from "../failures/details";
import type { StreamEventKind } from "../infrastructure/database/records/streamEvents";
import {
  buildTimeline,
  type DisplayEvent,
  type DisplayMessage,
  type DisplayToolCall,
} from "./timeline";
import {
  modelTokenUsage,
  toolInputTokens,
  toolOutputTokens,
} from "./timeline/tokenCounts";
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
interface EventRow {
  id: number;
  queue_id: number;
  message_id: string | null;
  kind: StreamEventKind;
  payload_json: string;
}
const storedMessageSchema = z.looseObject({
  type: z.string(),
  data: z.record(z.string(), z.unknown()),
});
const streamPayloadSchema = z.discriminatedUnion("kind", [
  z.looseObject({
    kind: z.enum(["assistant_reasoning_delta", "assistant_text_delta"]),
    value: z.string(),
  }),
  z.looseObject({ kind: z.literal("tool_call_delta"), value: z.unknown() }),
  z.looseObject({ kind: z.literal("tool_started"), value: z.string() }),
]);
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
      id: row.id,
      content: row.content,
      status: row.status,
      error: row.error ? parseError(row.error) : null,
      userMessageId: row.user_message_id,
      root: row.root_id === row.id,
    }));
  const events = db.db
    .query<EventRow, [string]>(
      `SELECT id, queue_id, message_id, kind, payload_json
       FROM events WHERE session_id = ? ORDER BY id`,
    )
    .all(sessionId)
    .map(toDisplayEvent);
  return { control, queue, view: buildTimeline(messages, queue, events) };
}

function toDisplayMessage(row: MessageRow): DisplayMessage {
  const stored = parseStored(row.message_json);
  stored.data.id = row.source_id;
  const [message] = mapStoredMessagesToChatMessages([stored]);
  if (!message) throw new Error("无法还原消息");
  const role = messageRole(message);
  const content = contentToText(message.content);
  if (role === "tool" && !ToolMessage.isInstance(message)) {
    throw new Error("工具消息类型无效");
  }
  return {
    id: row.id,
    ...(message.id ? { sourceId: message.id } : {}),
    role,
    content,
    reasoning: messageReasoning(message),
    images: extractToolImages(message.content),
    queueId: row.queue_id,
    toolCalls: extractToolCalls(message),
    toolCallId: extractToolCallId(message),
    ...(ToolMessage.isInstance(message)
      ? { outputTokens: toolOutputTokens(message, content) }
      : {}),
    usage: modelTokenUsage(message),
    createdAt: row.created_at,
  };
}

function toDisplayEvent(row: EventRow): DisplayEvent {
  const parsed = streamPayloadSchema.safeParse({
    kind: row.kind,
    value: JSON.parse(row.payload_json) as unknown,
  });
  if (!parsed.success) throw new Error("stream 文本增量无效");
  const { kind, value } = parsed.data;
  const payload =
    kind === "tool_call_delta"
      ? { call: value }
      : kind === "tool_started"
        ? { callId: value }
        : { text: value };
  return {
    id: row.id,
    message: kind,
    payload: {
      kind,
      queueId: row.queue_id,
      ...payload,
      ...(row.message_id ? { messageId: row.message_id } : {}),
    },
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
  if (message.type === "human") return "user";
  if (message.type === "tool") return "tool";
  return "assistant";
}
function extractToolCalls(message: BaseMessage): DisplayToolCall[] {
  const calls = readRecordArray(message, "tool_calls");
  return calls.map((call, index) => {
    const input = call["args"] ?? call["input"] ?? call;
    return {
      id: stringField(call, "id") ?? `tool-${index.toString()}`,
      index,
      inputTokens: toolInputTokens(call, input),
      ...(message.id ? { messageId: message.id } : {}),
      name: stringField(call, "name") ?? "tool",
      input,
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
