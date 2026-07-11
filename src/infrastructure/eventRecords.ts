import type { Database } from "bun:sqlite";

export type StreamToolCallDelta = Partial<
  Record<"args" | "id" | "name", string> & { index: number }
>;

export function insertEvent(
  db: Database,
  sessionId: string,
  level: string,
  category: string,
  message: string,
  payload: unknown,
) {
  db.query(
    "INSERT INTO events (session_id, level, category, message, payload_json, created_at) VALUES (?, ?, ?, ?, ?, unixepoch())",
  ).run(sessionId, level, category, message, JSON.stringify(payload));
}

export function insertStreamToken(
  db: Database,
  sessionId: string,
  queueId: number,
  text: string,
  messageId?: string,
) {
  insertEvent(db, sessionId, "info", "stream", "token", {
    kind: "assistant_text_delta",
    queueId,
    text,
    ...(messageId ? { messageId } : {}),
  });
}

export function insertStreamToolCall(
  db: Database,
  sessionId: string,
  queueId: number,
  call: StreamToolCallDelta,
  messageId?: string,
) {
  insertEvent(db, sessionId, "info", "stream", "tool_call", {
    kind: "tool_call_delta",
    queueId,
    call,
    ...(messageId ? { messageId } : {}),
  });
}
