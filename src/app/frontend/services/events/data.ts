import type { DisplayEvent } from "../../../timeline";
import type { ErrorDetails } from "../../../../failures/details";
import type { SessionInfo } from "../../../sessionState";
import { z } from "../validation";

const sessionInfoSchema: z.ZodType<SessionInfo> = z.object({
  createdAt: z.number().int(),
  error: z.custom<ErrorDetails>().nullable(),
  id: z.string(),
  status: z.enum(["tool", "model", "idle", "paused", "error"]),
  updatedAt: z.number().int(),
  workspace: z.string(),
});
const sessionsEventSchema = z.object({
  sessions: z.array(sessionInfoSchema),
});
const deletedEventSchema = z.object({ sessionId: z.string() });
const eventBase = {
  id: z.number().int().positive(),
  messageId: z.string().min(1),
  partId: z.string().min(1),
  queueId: z.number().int().positive(),
};
const displayEventSchema: z.ZodType<DisplayEvent> = z.discriminatedUnion("kind", [
  z.object({
    ...eventBase,
    kind: z.enum(["assistant_reasoning_delta", "assistant_text_delta"]),
    value: z.string(),
  }),
  z.object({
    ...eventBase,
    kind: z.literal("tool_call_delta"),
    value: z.object({
      argumentsDelta: z.string().optional(),
      freeform: z.boolean().optional(),
      idDelta: z.string().optional(),
      index: z.number().int().nonnegative(),
      nameDelta: z.string().optional(),
    }),
  }),
  z.object({ ...eventBase, kind: z.literal("tool_started"), value: z.string() }),
  z.object({
    ...eventBase,
    kind: z.literal("user_appended"),
    partId: z.literal("user"),
    value: z.null(),
  }),
]);
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
  if (!parsed.success) {
    throw new Error(`SSE ${name} 事件结构无效`);
  }
  return parsed.data;
}
