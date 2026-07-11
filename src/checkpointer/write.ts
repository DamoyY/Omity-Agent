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

export async function putCheckpoint(
  db: Database,
  serde: SerializerProtocol,
  config: RunnableConfig,
  checkpoint: Checkpoint,
  metadata: CheckpointMetadata,
): Promise<RunnableConfig> {
  const {
    thread_id,
    checkpoint_ns = "",
    checkpoint_id,
  } = config.configurable ?? {};
  if (!thread_id) {
    throw new Error("缺少 config.configurable.thread_id，无法保存 checkpoint");
  }
  const [[type1, serializedCheckpoint], [type2, serializedMetadata]] =
    await Promise.all([
      serde.dumpsTyped(copyCheckpoint(checkpoint)),
      serde.dumpsTyped(metadata),
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
  const {
    thread_id,
    checkpoint_ns = "",
    checkpoint_id,
  } = config.configurable ?? {};
  if (!thread_id || !checkpoint_id) {
    throw new Error("缺少 thread_id 或 checkpoint_id，无法保存 pending writes");
  }
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

type PendingWriteRow = {
  replace: boolean;
  bindings: SqlBinding[];
};

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
      const [type, serialized] = await serde.dumpsTyped(value);
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
