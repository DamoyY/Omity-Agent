import type { Database } from "bun:sqlite";
import {
  type Checkpoint,
  type CheckpointPendingWrite,
  type CheckpointTuple,
  type SerializerProtocol,
} from "@langchain/langgraph-checkpoint";
import type { RunnableConfig } from "@langchain/core/runnables";
import type { CheckpointRow, WriteJson } from "./sql";
import { deserialize } from "./serde";
import { hydrateCheckpoint, hydratePendingValue } from "./messageRefs";
import { z } from "zod";

interface TupleContext {
  db: Database;
  serde: SerializerProtocol;
}

const writeRowSchema = z.looseObject({
  task_id: z.string(),
  idx: z.number(),
  channel: z.string(),
  type: z.string(),
  value: z.string(),
});
export async function rowToTuple(
  row: CheckpointRow,
  config: RunnableConfig,
  ctx: TupleContext,
): Promise<CheckpointTuple> {
  const checkpoint = hydrateCheckpoint(
    ctx.db,
    await deserialize<Checkpoint>(ctx.serde, row.type, row.checkpoint),
  );
  return {
    config,
    checkpoint,
    metadata: await deserialize(ctx.serde, row.type, row.metadata),
    parentConfig: row.parent_checkpoint_id
      ? {
          configurable: {
            thread_id: row.thread_id,
            checkpoint_ns: row.checkpoint_ns,
            checkpoint_id: row.parent_checkpoint_id,
          },
        }
      : undefined,
    pendingWrites: await pendingWrites(row, ctx),
  };
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
