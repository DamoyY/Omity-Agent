import type { Database } from "bun:sqlite";
export type StreamToolCallDelta = Partial<
  Record<"args" | "id" | "name", string> & {
    freeform: boolean;
    index: number;
  }
>;
export type StreamEventKind =
  | "assistant_reasoning_delta"
  | "assistant_text_delta"
  | "tool_call_delta"
  | "tool_started";
interface StreamEventBase {
  id: number;
  queueId: number;
  messageId?: string;
}
export type StreamEvent = StreamEventBase &
  (
    | {
        kind: "assistant_reasoning_delta" | "assistant_text_delta";
        value: string;
      }
    | { kind: "tool_call_delta"; value: StreamToolCallDelta }
    | { kind: "tool_started"; value: string }
  );
function insertStreamEvent(
  db: Database,
  sessionId: string,
  queueId: number,
  kind: StreamEventKind,
  payload: unknown,
  messageId?: string,
) {
  const result = db
    .query(
      "INSERT INTO events (session_id, queue_id, message_id, kind, payload_json) VALUES (?, ?, ?, ?, ?)",
    )
    .run(sessionId, queueId, messageId ?? null, kind, JSON.stringify(payload));
  const id = Number(result.lastInsertRowid);
  if (!Number.isSafeInteger(id)) {
    throw new Error(`流式事件 ID 超出安全整数范围：${String(result.lastInsertRowid)}`);
  }
  return {
    id,
    kind,
    queueId,
    value: payload,
    ...(messageId ? { messageId } : {}),
  };
}
export function insertStreamToken(
  db: Database,
  sessionId: string,
  queueId: number,
  text: string,
  messageId?: string,
) {
  return insertStreamEvent(
    db,
    sessionId,
    queueId,
    "assistant_text_delta",
    text,
    messageId,
  ) as StreamEvent & { kind: "assistant_text_delta"; value: string };
}
export function insertStreamReasoning(
  db: Database,
  sessionId: string,
  queueId: number,
  text: string,
  messageId?: string,
) {
  return insertStreamEvent(
    db,
    sessionId,
    queueId,
    "assistant_reasoning_delta",
    text,
    messageId,
  ) as StreamEvent & { kind: "assistant_reasoning_delta"; value: string };
}
export function insertStreamToolCall(
  db: Database,
  sessionId: string,
  queueId: number,
  call: StreamToolCallDelta,
  messageId?: string,
) {
  return insertStreamEvent(
    db,
    sessionId,
    queueId,
    "tool_call_delta",
    call,
    messageId,
  ) as StreamEvent & { kind: "tool_call_delta"; value: StreamToolCallDelta };
}
export function insertToolStarted(
  db: Database,
  sessionId: string,
  queueId: number,
  callId: string,
) {
  return insertStreamEvent(db, sessionId, queueId, "tool_started", callId) as StreamEvent & {
    kind: "tool_started";
    value: string;
  };
}
export function clearStreamEvents(db: Database, sessionId: string) {
  db.query("DELETE FROM events WHERE session_id = ?").run(sessionId);
}
export function clearQueueStreamEvents(db: Database, queueId: number) {
  db.query("DELETE FROM events WHERE queue_id = ?").run(queueId);
}
