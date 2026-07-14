import type {
  StreamEvent,
  StreamEventKind,
} from "../../infrastructure/database/records/streamEvents";
import type { DisplayEvent } from "./types";
import { displayStreamEvent } from "./streamEvents";
import { z } from "zod";
export interface PersistedEventRow {
  id: number;
  queue_id: number;
  message_id: string | null;
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
      args: z.string().optional(),
      freeform: z.boolean().optional(),
      id: z.string().optional(),
      index: z.number().optional(),
      name: z.string().optional(),
    }),
  }),
  z.object({ kind: z.literal("tool_started"), value: z.string() }),
]);
export function persistedDisplayEvent(row: PersistedEventRow): DisplayEvent {
  const parsed = payloadSchema.safeParse({
    kind: row.kind,
    value: JSON.parse(row.payload_json) as unknown,
  });
  if (!parsed.success) {
    throw new Error("stream 文本增量无效");
  }
  const value = parsed.data;
  const base = {
    id: row.id,
    queueId: row.queue_id,
    ...(row.message_id ? { messageId: row.message_id } : {}),
  };
  const event: StreamEvent =
    value.kind === "tool_call_delta"
      ? { ...base, kind: value.kind, value: value.value }
      : value.kind === "tool_started"
        ? { ...base, kind: value.kind, value: value.value }
        : { ...base, kind: value.kind, value: value.value };
  return displayStreamEvent(event);
}
