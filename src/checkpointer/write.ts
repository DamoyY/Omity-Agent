import {
  type Checkpoint,
  type CheckpointMetadata,
  type PendingWrite,
  type SerializerProtocol,
  WRITES_IDX_MAP,
  copyCheckpoint,
} from "@langchain/langgraph-checkpoint";
import { type SqlBinding, optionalConfigString, requiredConfigString } from "./sql";
import {
  normalizeCheckpoint,
  normalizePendingValue,
  persistCheckpointMessages,
  persistPendingMessages,
} from "./messageRefs";
import {
  pruneMessageBlobs,
  replaceCheckpointBlobRefs,
  replaceWriteBlobRefs,
} from "../infrastructure/database/records/messages/blobStore";
import type { BaseMessage } from "@langchain/core/messages";
import type { Database } from "bun:sqlite";
import type { RunnableConfig } from "@langchain/core/runnables";
import { serialize } from "./serde";
export async function putCheckpoint(
  db: Database,
  serde: SerializerProtocol,
  config: RunnableConfig,
  checkpoint: Checkpoint,
  metadata: CheckpointMetadata,
  sessionId: string,
): Promise<RunnableConfig> {
  const thread_id = requiredConfigString(
    config.configurable?.["thread_id"],
    "config.configurable.thread_id",
  );
  const checkpoint_ns =
    optionalConfigString(config.configurable?.["checkpoint_ns"], "checkpoint_ns") ?? "";
  const checkpoint_id = optionalConfigString(
    config.configurable?.["checkpoint_id"],
    "checkpoint_id",
  );
  const normalized = normalizeCheckpoint(copyCheckpoint(checkpoint));
  const [[type1, serializedCheckpoint], [type2, serializedMetadata]] = await Promise.all([
    serialize(serde, normalized.checkpoint),
    serialize(serde, metadata),
  ]);
  if (type1 !== type2) {
    throw new Error("checkpoint 与 metadata 的序列化类型不一致");
  }
  db.transaction(() => {
    persistCheckpointMessages(db, sessionId, normalized.messages, normalized.referencedMessages);
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
    replaceCheckpointBlobRefs(
      db,
      {
        checkpointId: checkpoint.id,
        checkpointNs: checkpoint_ns,
        threadId: thread_id,
      },
      [...(normalized.messages ?? []), ...normalized.referencedMessages],
    );
    pruneMessageBlobs(db);
  })();
  return {
    configurable: { checkpoint_id: checkpoint.id, checkpoint_ns, thread_id },
  };
}
export async function putPendingWrites(
  db: Database,
  serde: SerializerProtocol,
  config: RunnableConfig,
  writes: PendingWrite[],
  taskId: string,
) {
  const thread_id = requiredConfigString(config.configurable?.["thread_id"], "thread_id");
  const checkpoint_ns =
    optionalConfigString(config.configurable?.["checkpoint_ns"], "checkpoint_ns") ?? "";
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
      let changed = false;
      for (const item of items) {
        const result = (item.replace ? replace : ignore).run(...item.bindings);
        if (result.changes === 1) {
          persistPendingMessages(db, item.messages);
          replaceWriteBlobRefs(db, item.key, item.messages ?? []);
          changed = true;
        }
      }
      if (changed) {
        pruneMessageBlobs(db);
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
  key: {
    threadId: string;
    checkpointNs: string;
    checkpointId: string;
    taskId: string;
    idx: number;
  };
  messages?: BaseMessage[];
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
      const normalized = normalizePendingValue(value);
      const [type, serialized] = await serialize(serde, normalized.value);
      const writeIndex = WRITES_IDX_MAP[channel] ?? idx;
      return {
        key: {
          checkpointId,
          checkpointNs,
          idx: writeIndex,
          taskId,
          threadId,
        },
        replace: channel in WRITES_IDX_MAP,
        ...(normalized.messages ? { messages: normalized.messages } : {}),
        bindings: [
          threadId,
          checkpointNs,
          checkpointId,
          taskId,
          writeIndex,
          channel,
          type,
          serialized,
        ],
      };
    }),
  );
}
