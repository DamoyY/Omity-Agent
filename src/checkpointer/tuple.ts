import type {
  Checkpoint,
  CheckpointMetadata,
  CheckpointPendingWrite,
  CheckpointTuple,
  SerializerProtocol,
} from "@langchain/langgraph-checkpoint";
import type { CheckpointRow, WriteJson } from "./sql";
import { hydrateCheckpoint, hydratePendingValue } from "./messageRefs";
import type { Database } from "bun:sqlite";
import type { RunnableConfig } from "@langchain/core/runnables";
import { deserialize } from "./serde";
import { z } from "zod";

interface TupleContext {
  db: Database;
  serde: SerializerProtocol;
}
const writeRowSchema = z.looseObject({
  channel: z.string(),
  idx: z.number(),
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
    parseCheckpoint(await deserialize(ctx.serde, row.type, row.checkpoint)),
  );
  return {
    checkpoint,
    config,
    metadata: parseCheckpointMetadata(await deserialize(ctx.serde, row.type, row.metadata)),
    parentConfig: row.parent_checkpoint_id
      ? {
          configurable: {
            checkpoint_id: row.parent_checkpoint_id,
            checkpoint_ns: row.checkpoint_ns,
            thread_id: row.thread_id,
          },
        }
      : undefined,
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
        hydratePendingValue(ctx.db, await deserialize(ctx.serde, write.type, write.value)),
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
