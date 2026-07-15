import {
  type ChannelVersions,
  type Checkpoint,
  type CheckpointMetadata,
  type SerializerProtocol,
  copyCheckpoint,
} from "@langchain/langgraph-checkpoint";
import { normalizeCheckpoint, persistCheckpointMessages } from "./messageRefs";
import { optionalConfigString, requiredConfigString } from "./sql";
import type { BaseMessage } from "@langchain/core/messages";
import type { Database } from "bun:sqlite";
import type { RunnableConfig } from "@langchain/core/runnables";
import { pruneUnreferencedMessages } from "../infrastructure/database/records/messages/history";

export interface PreparedCheckpoint {
  checkpointId: string;
  checkpointNs: string;
  checkpointType: string;
  checkpointValue: Uint8Array;
  messages?: BaseMessage[];
  messagesChanged: boolean;
  metadataValue: Uint8Array;
  parentCheckpointId?: string;
  sessionId: string;
  threadId: string;
}

export async function prepareCheckpoint(
  serde: SerializerProtocol,
  config: RunnableConfig,
  checkpoint: Checkpoint,
  metadata: CheckpointMetadata,
  sessionId: string,
  newVersions?: ChannelVersions,
): Promise<PreparedCheckpoint> {
  const threadId = requiredConfigString(
    config.configurable?.["thread_id"],
    "config.configurable.thread_id",
  );
  const checkpointNs =
    optionalConfigString(config.configurable?.["checkpoint_ns"], "checkpoint_ns") ?? "";
  const parentCheckpointId = optionalConfigString(
    config.configurable?.["checkpoint_id"],
    "checkpoint_id",
  );
  const normalized = normalizeCheckpoint(copyCheckpoint(checkpoint));
  const [[checkpointType, checkpointValue], [metadataType, metadataValue]] = await Promise.all([
    serde.dumpsTyped(normalized.checkpoint),
    serde.dumpsTyped(metadata),
  ]);
  if (checkpointType !== metadataType) {
    throw new Error("checkpoint 与 metadata 的序列化类型不一致");
  }
  return {
    checkpointId: checkpoint.id,
    checkpointNs,
    checkpointType,
    checkpointValue,
    messagesChanged: newVersions === undefined || Object.hasOwn(newVersions, "messages"),
    metadataValue,
    sessionId,
    threadId,
    ...(normalized.messages ? { messages: normalized.messages } : {}),
    ...(parentCheckpointId ? { parentCheckpointId } : {}),
  };
}

export function commitCheckpoint(db: Database, item: PreparedCheckpoint): RunnableConfig {
  db.transaction(() => {
    const current = db
      .query<{ checkpoint_id: string }, [string, string]>(
        "SELECT checkpoint_id FROM checkpoints WHERE thread_id = ? AND checkpoint_ns = ?",
      )
      .get(item.threadId, item.checkpointNs);
    assertCheckpointParent(current?.checkpoint_id, item);
    if (item.messages && (!current || item.messagesChanged)) {
      persistCheckpointMessages(db, item.sessionId, item.messages);
    }
    db.run(
      `DELETE FROM writes
       WHERE thread_id = ? AND checkpoint_ns = ? AND checkpoint_id <> ?`,
      [item.threadId, item.checkpointNs, item.checkpointId],
    );
    db.query(
      `INSERT INTO checkpoints
         (thread_id, checkpoint_ns, checkpoint_id, type, checkpoint, metadata)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(thread_id, checkpoint_ns) DO UPDATE SET
         checkpoint_id = excluded.checkpoint_id,
         type = excluded.type,
         checkpoint = excluded.checkpoint,
         metadata = excluded.metadata`,
    ).run(
      item.threadId,
      item.checkpointNs,
      item.checkpointId,
      item.checkpointType,
      item.checkpointValue,
      item.metadataValue,
    );
    pruneUnreferencedMessages(db, item.sessionId);
  })();
  return {
    configurable: {
      checkpoint_id: item.checkpointId,
      checkpoint_ns: item.checkpointNs,
      thread_id: item.threadId,
    },
  };
}

function assertCheckpointParent(currentId: string | undefined, item: PreparedCheckpoint) {
  if (
    currentId === item.checkpointId ||
    (item.parentCheckpointId === undefined && currentId === undefined) ||
    item.parentCheckpointId === currentId
  ) {
    return;
  }
  throw new Error(
    `checkpoint head 冲突：期望 ${item.parentCheckpointId ?? "empty"}，实际 ${currentId ?? "empty"}`,
  );
}
