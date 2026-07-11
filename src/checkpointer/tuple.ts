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
import { deserialize } from "./serde";

interface TupleContext {
  db: Database;
  serde: SerializerProtocol;
  nextVersion: () => number | string;
}

export async function rowToTuple(
  row: CheckpointRow,
  config: RunnableConfig,
  ctx: TupleContext,
): Promise<CheckpointTuple> {
  const checkpoint = await deserialize<Checkpoint>(
    ctx.serde,
    row.type ?? "json",
    row.checkpoint,
  );
  if (checkpoint.v < 4 && row.parent_checkpoint_id) {
    await migratePendingSends(checkpoint, row, ctx);
  }
  return {
    config,
    checkpoint,
    metadata: await deserialize(ctx.serde, row.type ?? "json", row.metadata),
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
  const writes = parseWriteRows(row.pending_writes ?? "[]");
  return Promise.all(
    writes.map(async (write): Promise<CheckpointPendingWrite> => [
      write.task_id,
      write.channel,
      await deserialize(serde, write.type ?? "json", write.value ?? ""),
    ]),
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
  const sends = parsePendingSends(pending?.pending_sends ?? "[]");
  checkpoint.channel_values[TASKS] = await Promise.all(
    sends.map(({ type, value }) => deserialize(ctx.serde, type, value)),
  );
  checkpoint.channel_versions[TASKS] =
    Object.keys(checkpoint.channel_versions).length > 0
      ? maxChannelVersion(...Object.values(checkpoint.channel_versions))
      : ctx.nextVersion();
}

function parseWriteRows(value: string): WriteJson[] {
  const parsed: unknown = JSON.parse(value);
  if (!Array.isArray(parsed) || !parsed.every(isWriteRow)) {
    throw new Error("checkpoint pending writes 记录无效");
  }
  return parsed;
}

function parsePendingSends(value: string) {
  const parsed: unknown = JSON.parse(value);
  if (!Array.isArray(parsed) || !parsed.every(isPendingSend)) {
    throw new Error("checkpoint pending sends 记录无效");
  }
  return parsed;
}

function isWriteRow(value: unknown): value is WriteJson {
  return (
    isRecord(value) &&
    typeof value["task_id"] === "string" &&
    typeof value["idx"] === "number" &&
    typeof value["channel"] === "string" &&
    isOptionalString(value["type"]) &&
    isOptionalString(value["value"])
  );
}

function isPendingSend(
  value: unknown,
): value is { type: string; value: string } {
  return (
    isRecord(value) &&
    typeof value["type"] === "string" &&
    typeof value["value"] === "string"
  );
}

function isOptionalString(value: unknown) {
  return value === null || typeof value === "string";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
