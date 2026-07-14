import { z } from "zod";
import type { ErrorDetails } from "../../../../failures/details";
import type { DisplayEvent } from "../../../timeline";
import type { SessionInfo } from "../../../sessionState";
const sessionInfoSchema: z.ZodType<SessionInfo> = z.object({
  id: z.string(),
  workspace: z.string(),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
  status: z.enum(["tool", "model", "idle", "paused", "error"]),
  error: z.custom<ErrorDetails>().nullable(),
});
const sessionsEventSchema = z.object({
  sessions: z.array(sessionInfoSchema),
});
const deletedEventSchema = z.object({ sessionId: z.string() });
const displayEventSchema: z.ZodType<DisplayEvent> = z.object({
  id: z.number().int().positive(),
  message: z.string(),
  payload: z.unknown(),
});
export function readSessionsEvent(event: Event) {
  return readEventData(event, sessionsEventSchema, "sessions").sessions;
}
export function readSessionEvent(event: Event) {
  return readEventData(event, sessionInfoSchema, "session");
}
export function readDeletedEvent(event: Event) {
  return readEventData(event, deletedEventSchema, "deleted").sessionId;
}
export function readTranscriptEvent(event: Event) {
  return readEventData(event, displayEventSchema, "delta");
}
function readEventData<T>(event: Event, schema: z.ZodType<T>, name: string) {
  if (!("data" in event) || typeof event.data !== "string") {
    throw new Error(`SSE ${name} 事件缺少字符串 data`);
  }
  let value: unknown;
  try {
    value = JSON.parse(event.data) as unknown;
  } catch (error) {
    throw new Error(`SSE ${name} 事件 JSON 无效`, { cause: error });
  }
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new Error(`SSE ${name} 事件结构无效`);
  return parsed.data;
}
