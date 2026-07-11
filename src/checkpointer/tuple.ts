import type { Database } from "bun:sqlite";
import {
  TASKS,
  maxChannelVersion,
  type Checkpoint,
  type CheckpointPendingWrite,
  type CheckpointTuple,
  type SerializerProtocol,
} from "@langchain/langgraph-checkpoint";
import type { RunnableConfig } from "@langchain/core/runnables";
import type { CheckpointRow, WriteJson } from "./sql";

type TupleContext = {
  db: Database;
  serde: SerializerProtocol;
  nextVersion: () => number | string;
};

export async function rowToTuple(
  row: CheckpointRow,
  config: RunnableConfig,
  ctx: TupleContext,
): Promise<CheckpointTuple> {
  const checkpoint = await ctx.serde.loadsTyped(
    row.type ?? "json",
    row.checkpoint,
  );
  if (checkpoint.v < 4 && row.parent_checkpoint_id) {
    await migratePendingSends(checkpoint, row, ctx);
  }
  return {
    config,
    checkpoint,
    metadata: await ctx.serde.loadsTyped(row.type ?? "json", row.metadata),
    parentConfig: row.parent_checkpoint_id
      ? {
          configurable: {
            thread_id: row.thread_id,
            checkpoint_ns: row.checkpoint_ns,
            checkpoint_id: row.parent_checkpoint_id,
          },
        }
      : undefined,
    pendingWrites: await pendingWrites(row, ctx.serde),
  };
}

async function pendingWrites(
  row: CheckpointRow,
  serde: SerializerProtocol,
): Promise<CheckpointPendingWrite[]> {
  return Promise.all(
    JSON.parse(row.pending_writes ?? "[]").map((write: WriteJson) =>
      serde
        .loadsTyped(write.type ?? "json", write.value ?? "")
        .then((value) => [write.task_id, write.channel, value]),
    ),
  );
}

async function migratePendingSends(
  checkpoint: Checkpoint,
  row: CheckpointRow,
  ctx: TupleContext,
) {
  const pending = ctx.db
    .query<{ pending_sends: string | null }, [string, string, string, string]>(
      `SELECT json_group_array(json_object(
         'type', pending.type,
         'value', CAST(pending.value AS TEXT)
       )) as pending_sends
       FROM (
         SELECT type, value FROM writes
         WHERE thread_id = ? AND checkpoint_ns = ?
           AND checkpoint_id = ? AND channel = ?
         ORDER BY idx
       ) as pending`,
    )
    .get(
      row.thread_id,
      row.checkpoint_ns,
      row.parent_checkpoint_id ?? "",
      TASKS,
    );
  checkpoint.channel_values ??= {};
  checkpoint.channel_values[TASKS] = await Promise.all(
    JSON.parse(pending?.pending_sends ?? "[]").map(
      ({ type, value }: { type: string; value: string }) =>
        ctx.serde.loadsTyped(type, value),
    ),
  );
  checkpoint.channel_versions[TASKS] =
    Object.keys(checkpoint.channel_versions).length > 0
      ? maxChannelVersion(...Object.values(checkpoint.channel_versions))
      : ctx.nextVersion();
}
