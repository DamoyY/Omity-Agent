import type { Database } from "bun:sqlite";

export interface StreamToolCallDelta {
  index: number;
  argumentsDelta?: string;
  freeform?: boolean;
  idDelta?: string;
  nameDelta?: string;
}
export type StreamEventKind =
  | "assistant_reasoning_delta"
  | "assistant_text_delta"
  | "tool_call_delta"
  | "tool_started"
  | "user_appended";
interface StreamEventBase {
  id: number;
  messageId: string;
  partId: string;
  queueId: number;
}
interface StreamEventValues {
  assistant_reasoning_delta: string;
  assistant_text_delta: string;
  tool_call_delta: StreamToolCallDelta;
  tool_started: string;
  user_appended: null;
}
type StreamEventOf<Kind extends StreamEventKind> = StreamEventBase & {
  kind: Kind;
  value: StreamEventValues[Kind];
};
export type StreamEvent = {
  [Kind in StreamEventKind]: StreamEventOf<Kind>;
}[StreamEventKind];
export type StreamEventDraft = {
  [Kind in StreamEventKind]: Omit<StreamEventOf<Kind>, "id">;
}[StreamEventKind];

export function insertStreamEvent(
  db: Database,
  sessionId: string,
  event: StreamEventDraft,
): StreamEvent {
  const result = db.run(
    `INSERT INTO events
       (session_id, queue_id, message_id, part_id, kind, payload_json)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      sessionId,
      event.queueId,
      event.messageId,
      event.partId,
      event.kind,
      JSON.stringify(event.value),
    ],
  );
  const id = Number(result.lastInsertRowid);
  if (!Number.isSafeInteger(id)) {
    throw new Error(`流式事件 ID 超出安全整数范围：${String(result.lastInsertRowid)}`);
  }
  return { ...event, id };
}
export function deleteSessionStream(db: Database, sessionId: string) {
  db.run("DELETE FROM events WHERE session_id = ? AND kind <> 'user_appended'", [sessionId]);
}
export function deleteQueueStream(db: Database, queueId: number) {
  db.run("DELETE FROM events WHERE queue_id = ?", [queueId]);
}
