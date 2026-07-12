import type { Database } from "bun:sqlite";

export type StreamToolCallDelta = Partial<
  Record<"args" | "id" | "name", string> & { index: number }
>;

export type StreamEventKind =
  | "assistant_reasoning_delta"
  | "assistant_text_delta"
  | "tool_call_delta"
  | "tool_started";

function insertStreamEvent(
  db: Database,
  sessionId: string,
  queueId: number,
  kind: StreamEventKind,
  payload: unknown,
  messageId?: string,
) {
  db.query(
    "INSERT INTO events (session_id, queue_id, message_id, kind, payload_json) VALUES (?, ?, ?, ?, ?)",
  ).run(sessionId, queueId, messageId ?? null, kind, JSON.stringify(payload));
}

export function insertStreamToken(
  db: Database,
  sessionId: string,
  queueId: number,
  text: string,
  messageId?: string,
) {
  insertStreamEvent(
    db,
    sessionId,
    queueId,
    "assistant_text_delta",
    text,
    messageId,
  );
}

export function insertStreamReasoning(
  db: Database,
  sessionId: string,
  queueId: number,
  text: string,
  messageId?: string,
) {
  insertStreamEvent(
    db,
    sessionId,
    queueId,
    "assistant_reasoning_delta",
    text,
    messageId,
  );
}

export function insertStreamToolCall(
  db: Database,
  sessionId: string,
  queueId: number,
  call: StreamToolCallDelta,
  messageId?: string,
) {
  insertStreamEvent(db, sessionId, queueId, "tool_call_delta", call, messageId);
}

export function insertToolStarted(
  db: Database,
  sessionId: string,
  queueId: number,
  callId: string,
) {
  insertStreamEvent(db, sessionId, queueId, "tool_started", callId);
}

export function clearStreamEvents(db: Database, sessionId: string) {
  db.query("DELETE FROM events WHERE session_id = ?").run(sessionId);
}

export function clearQueueStreamEvents(db: Database, queueId: number) {
  db.query("DELETE FROM events WHERE queue_id = ?").run(queueId);
}
