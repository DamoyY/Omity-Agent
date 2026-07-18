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
interface StreamEventValues {
  assistant_reasoning_delta: string;
  assistant_text_delta: string;
  tool_call_delta: StreamToolCallDelta;
  tool_started: string;
}
type StreamEventOf<Kind extends StreamEventKind> = StreamEventBase & {
  kind: Kind;
  value: StreamEventValues[Kind];
};
export type StreamEvent = {
  [Kind in StreamEventKind]: StreamEventOf<Kind>;
}[StreamEventKind];
function insertStreamEvent<Kind extends StreamEventKind>(
  db: Database,
  sessionId: string,
  queueId: number,
  kind: Kind,
  payload: StreamEventValues[Kind],
  messageId?: string,
): StreamEventOf<Kind> {
  const result = db.run(
    "INSERT INTO events (session_id, queue_id, message_id, kind, payload_json) VALUES (?, ?, ?, ?, ?)",
    [sessionId, queueId, messageId ?? null, kind, JSON.stringify(payload)],
  );
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
  return insertStreamEvent(db, sessionId, queueId, "assistant_text_delta", text, messageId);
}
export function insertStreamReasoning(
  db: Database,
  sessionId: string,
  queueId: number,
  text: string,
  messageId?: string,
) {
  return insertStreamEvent(db, sessionId, queueId, "assistant_reasoning_delta", text, messageId);
}
export function insertStreamToolCall(
  db: Database,
  sessionId: string,
  queueId: number,
  call: StreamToolCallDelta,
  messageId?: string,
) {
  return insertStreamEvent(db, sessionId, queueId, "tool_call_delta", call, messageId);
}
export function insertToolStarted(
  db: Database,
  sessionId: string,
  queueId: number,
  callId: string,
) {
  return insertStreamEvent(db, sessionId, queueId, "tool_started", callId);
}
export function clearStreamEvents(db: Database, sessionId: string) {
  db.run("DELETE FROM events WHERE session_id = ?", [sessionId]);
}
export function clearQueueStreamEvents(db: Database, queueId: number) {
  db.run("DELETE FROM events WHERE queue_id = ?", [queueId]);
}
