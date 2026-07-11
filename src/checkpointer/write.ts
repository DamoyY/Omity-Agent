import type { Database } from "bun:sqlite";
import {
  WRITES_IDX_MAP,
  copyCheckpoint,
  type Checkpoint,
  type CheckpointMetadata,
  type PendingWrite,
  type SerializerProtocol,
} from "@langchain/langgraph-checkpoint";
import type { RunnableConfig } from "@langchain/core/runnables";
import type { SqlBinding } from "./sql";
import { optionalConfigString, requiredConfigString } from "./sql";
import { serialize } from "./serde";

export async function putCheckpoint(
  db: Database,
  serde: SerializerProtocol,
  config: RunnableConfig,
  checkpoint: Checkpoint,
  metadata: CheckpointMetadata,
): Promise<RunnableConfig> {
  const thread_id = requiredConfigString(
    config.configurable?.["thread_id"],
    "config.configurable.thread_id",
  );
  const checkpoint_ns =
    optionalConfigString(
      config.configurable?.["checkpoint_ns"],
      "checkpoint_ns",
    ) ?? "";
  const checkpoint_id = optionalConfigString(
    config.configurable?.["checkpoint_id"],
    "checkpoint_id",
  );
  const [[type1, serializedCheckpoint], [type2, serializedMetadata]] =
    await Promise.all([
      serialize(serde, copyCheckpoint(checkpoint)),
      serialize(serde, metadata),
    ]);
  if (type1 !== type2) {
    throw new Error("checkpoint 与 metadata 的序列化类型不一致");
  }
  db.query(
    "INSERT OR REPLACE INTO checkpoints (thread_id, checkpoint_ns, checkpoint_id, parent_checkpoint_id, type, checkpoint, metadata) VALUES (?, ?, ?, ?, ?, ?, ?)",
  ).run(
    thread_id,
    checkpoint_ns,
    checkpoint.id,
    checkpoint_id ?? null,
    type1,
    serializedCheckpoint,
    serializedMetadata,
  );
  return {
    configurable: { thread_id, checkpoint_ns, checkpoint_id: checkpoint.id },
  };
}

export async function putPendingWrites(
  db: Database,
  serde: SerializerProtocol,
  config: RunnableConfig,
  writes: PendingWrite[],
  taskId: string,
) {
  const thread_id = requiredConfigString(
    config.configurable?.["thread_id"],
    "thread_id",
  );
  const checkpoint_ns =
    optionalConfigString(
      config.configurable?.["checkpoint_ns"],
      "checkpoint_ns",
    ) ?? "";
  const checkpoint_id = requiredConfigString(
    config.configurable?.["checkpoint_id"],
    "checkpoint_id",
  );
  const replace = db.prepare(
    `INSERT OR REPLACE INTO writes
     (thread_id, checkpoint_ns, checkpoint_id, task_id, idx, channel, type, value)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const ignore = db.prepare(
    `INSERT OR IGNORE INTO writes
     (thread_id, checkpoint_ns, checkpoint_id, task_id, idx, channel, type, value)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const rows = await pendingWriteRows(
    serde,
    writes,
    thread_id,
    checkpoint_ns,
    checkpoint_id,
    taskId,
  );
  try {
    db.transaction((items: PendingWriteRow[]) => {
      for (const item of items) {
        (item.replace ? replace : ignore).run(...item.bindings);
      }
    })(rows);
  } finally {
    replace.finalize();
    ignore.finalize();
  }
}

interface PendingWriteRow {
  replace: boolean;
  bindings: SqlBinding[];
}

async function pendingWriteRows(
  serde: SerializerProtocol,
  writes: PendingWrite[],
  threadId: string,
  checkpointNs: string,
  checkpointId: string,
  taskId: string,
) {
  return Promise.all(
    writes.map(async ([channel, value], idx) => {
      const [type, serialized] = await serialize(serde, value);
      return {
        replace: channel in WRITES_IDX_MAP,
        bindings: [
          threadId,
          checkpointNs,
          checkpointId,
          taskId,
          WRITES_IDX_MAP[channel] ?? idx,
          channel,
          type,
          serialized,
        ],
      };
    }),
  );
}
