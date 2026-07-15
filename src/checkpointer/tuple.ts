import type {
  Checkpoint,
  CheckpointMetadata,
  CheckpointPendingWrite,
  CheckpointTuple,
  SerializerProtocol,
} from "@langchain/langgraph-checkpoint";
import type { CheckpointRow, WriteJson } from "./sql";
import type { Database } from "bun:sqlite";
import type { RunnableConfig } from "@langchain/core/runnables";
import { hydrateCheckpoint } from "./messageRefs";
import { hydratePendingValue } from "./pendingMessages";
import { loadMessageRows } from "../infrastructure/database/records/messages/history";
import { messageRowsToChatMessages } from "../infrastructure/database/records/messages/serialization";
import { z } from "zod";

interface TupleContext {
  db: Database;
  serde: SerializerProtocol;
  sessionId: string;
}
const writeRowSchema = z.looseObject({
  channel: z.string(),
  idx: z.number(),
  message_ids: z.array(z.number()),
  task_id: z.string(),
  type: z.string(),
  value: z.string(),
});
const channelVersionSchema = z.union([z.number(), z.string()]);
const channelVersionsSchema = z.record(z.string(), channelVersionSchema);
const checkpointSchema: z.ZodType<Checkpoint> = z.looseObject({
  channel_values: z.record(z.string(), z.unknown()),
  channel_versions: channelVersionsSchema,
  id: z.string(),
  ts: z.string(),
  v: z.number(),
  versions_seen: z.record(z.string(), channelVersionsSchema),
});
const checkpointMetadataSchema: z.ZodType<CheckpointMetadata> = z.looseObject({
  counters_since_delta_snapshot: z.record(z.string(), z.tuple([z.number(), z.number()])).optional(),
  parents: z.record(z.string(), z.string()),
  source: z.enum(["input", "loop", "update", "fork"]),
  step: z.number(),
});
export async function rowToTuple(
  row: CheckpointRow,
  config: RunnableConfig,
  ctx: TupleContext,
): Promise<CheckpointTuple> {
  const checkpoint = hydrateCheckpoint(
    ctx.db,
    ctx.sessionId,
    parseCheckpoint(await ctx.serde.loadsTyped(row.type, row.checkpoint)),
  );
  return {
    checkpoint,
    config,
    metadata: parseCheckpointMetadata(await ctx.serde.loadsTyped(row.type, row.metadata)),
    pendingWrites: await pendingWrites(row, ctx),
  };
}
function parseCheckpoint(value: unknown): Checkpoint {
  const result = checkpointSchema.safeParse(value);
  if (!result.success) {
    throw new Error("checkpoint 记录无效");
  }
  return result.data;
}
function parseCheckpointMetadata(value: unknown): CheckpointMetadata {
  const result = checkpointMetadataSchema.safeParse(value);
  if (!result.success) {
    throw new Error("checkpoint metadata 记录无效");
  }
  return result.data;
}
async function pendingWrites(
  row: CheckpointRow,
  ctx: TupleContext,
): Promise<CheckpointPendingWrite[]> {
  const writes = parseWriteRows(row.pending_writes);
  return Promise.all(
    writes.map(
      async (write): Promise<CheckpointPendingWrite> => [
        write.task_id,
        write.channel,
        hydratePendingValue(
          await ctx.serde.loadsTyped(write.type, write.value),
          messageRowsToChatMessages(loadMessageRows(ctx.db, write.message_ids)),
        ),
      ],
    ),
  );
}
function parseWriteRows(value: string): WriteJson[] {
  const parsed: unknown = JSON.parse(value);
  const result = z.array(writeRowSchema).safeParse(parsed);
  if (!result.success) {
    throw new Error("checkpoint pending writes 记录无效");
  }
  return result.data;
}
