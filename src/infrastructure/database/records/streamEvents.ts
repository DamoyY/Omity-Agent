import { type BaseMessage, ToolMessage } from "@langchain/core/messages";
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
  | "tool_finished"
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
  tool_finished: string;
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
interface StartedToolCall {
  callId: string;
  messageId: string;
  partId: string;
  queueId: number;
}

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
function loadStartedToolCalls(db: Database, sessionId: string): StartedToolCall[] {
  const rows = db
    .query<
      {
        message_id: string;
        part_id: string;
        payload_json: string;
        queue_id: number;
      },
      [string]
    >(
      `SELECT queue_id, message_id, part_id, payload_json
       FROM events WHERE session_id = ? AND kind = 'tool_started' ORDER BY id`,
    )
    .all(sessionId);
  return rows.map((row) => {
    const callId: unknown = JSON.parse(row.payload_json);
    if (typeof callId !== "string" || callId.length === 0) {
      throw new Error("工具开始事件缺少调用 ID");
    }
    return {
      callId,
      messageId: row.message_id,
      partId: row.part_id,
      queueId: row.queue_id,
    };
  });
}
export function finishToolStreams(db: Database, sessionId: string, messages: BaseMessage[]) {
  const started = loadStartedToolCalls(db, sessionId);
  deleteSessionStream(db, sessionId);
  const completedCallIds = new Set(
    messages.flatMap((message) => (ToolMessage.isInstance(message) ? [message.tool_call_id] : [])),
  );
  return started.flatMap((tool) =>
    completedCallIds.has(tool.callId)
      ? [
          insertStreamEvent(db, sessionId, {
            kind: "tool_finished",
            messageId: tool.messageId,
            partId: tool.partId,
            queueId: tool.queueId,
            value: tool.callId,
          }),
        ]
      : [],
  );
}
export function deleteSessionStream(db: Database, sessionId: string) {
  db.run("DELETE FROM events WHERE session_id = ? AND kind <> 'user_appended'", [sessionId]);
}
export function deleteQueueStream(db: Database, queueId: number) {
  db.run("DELETE FROM events WHERE queue_id = ?", [queueId]);
}
