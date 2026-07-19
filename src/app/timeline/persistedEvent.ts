import type {
  StreamEvent,
  StreamEventKind,
} from "../../infrastructure/database/records/streamEvents";
import { z } from "zod";

export interface PersistedEventRow {
  id: number;
  queue_id: number;
  message_id: string;
  part_id: string;
  kind: StreamEventKind;
  payload_json: string;
}
const payloadSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.enum(["assistant_reasoning_delta", "assistant_text_delta"]),
    value: z.string(),
  }),
  z.object({
    kind: z.literal("tool_call_delta"),
    value: z.object({
      argumentsDelta: z.string().optional(),
      freeform: z.boolean().optional(),
      idDelta: z.string().optional(),
      index: z.number().int().nonnegative(),
      nameDelta: z.string().optional(),
    }),
  }),
  z.object({ kind: z.literal("tool_started"), value: z.string() }),
  z.object({ kind: z.literal("user_appended"), value: z.null() }),
]);
export function persistedDisplayEvent(row: PersistedEventRow): StreamEvent {
  const parsed = payloadSchema.safeParse({
    kind: row.kind,
    value: JSON.parse(row.payload_json) as unknown,
  });
  if (!parsed.success) {
    throw new Error("流式事件内容无效");
  }
  const base = {
    id: row.id,
    messageId: row.message_id,
    partId: row.part_id,
    queueId: row.queue_id,
  };
  if (parsed.data.kind === "tool_call_delta") {
    return { ...base, kind: parsed.data.kind, value: parsed.data.value };
  }
  if (parsed.data.kind === "tool_started") {
    return { ...base, kind: parsed.data.kind, value: parsed.data.value };
  }
  if (parsed.data.kind === "user_appended") {
    return { ...base, kind: parsed.data.kind, value: parsed.data.value };
  }
  return { ...base, kind: parsed.data.kind, value: parsed.data.value };
}
