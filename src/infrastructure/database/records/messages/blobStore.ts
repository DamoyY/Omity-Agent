import { createHash, randomUUID } from "node:crypto";
import { messageInsert, messageRowsToChatMessages } from "./serialization";
import type { BaseMessage } from "@langchain/core/messages";
import type { Database } from "bun:sqlite";

export interface StoredMessageRef {
  sourceId: string;
  digest: string;
}
export function loadMessagesByRefs(db: Database, refs: StoredMessageRef[]) {
  const select = db.prepare<{ message_json: string }, [string]>(
    "SELECT message_json FROM message_blobs WHERE digest = ?",
  );
  try {
    return refs.map((ref) => {
      const row = select.get(ref.digest);
      if (!row) {
        throw new Error(`checkpoint 消息正文不存在：${ref.digest}`);
      }
      const [message] = messageRowsToChatMessages([{ ...row, source_id: ref.sourceId }]);
      if (!message) {
        throw new Error(`无法还原 checkpoint 消息：${ref.sourceId}`);
      }
      return message;
    });
  } finally {
    select.finalize();
  }
}
export function messageRef(message: BaseMessage): StoredMessageRef {
  message.id ??= randomUUID();
  const item = messageInsert(message);
  return {
    digest: createHash("sha256").update(item.messageJson).digest("base64url"),
    sourceId: item.sourceId,
  };
}
export function persistMessageBlob(db: Database, message: BaseMessage) {
  const item = messageInsert(message);
  const ref = messageRef(message);
  internMessage(db, ref, item.messageJson);
  return ref;
}
export function pruneMessageBlobs(db: Database) {
  db.run(
    `DELETE FROM message_blobs
     WHERE digest NOT IN (SELECT blob_digest FROM messages)
       AND digest NOT IN (SELECT digest FROM checkpoint_blob_refs)
       AND digest NOT IN (SELECT digest FROM write_blob_refs)`,
  );
}
export function replaceCheckpointBlobRefs(
  db: Database,
  key: { threadId: string; checkpointNs: string; checkpointId: string },
  messages: BaseMessage[],
) {
  db.run(
    `DELETE FROM checkpoint_blob_refs
     WHERE thread_id = ? AND checkpoint_ns = ? AND checkpoint_id = ?`,
    [key.threadId, key.checkpointNs, key.checkpointId],
  );
  const insert = db.prepare(
    `INSERT OR IGNORE INTO checkpoint_blob_refs
     (thread_id, checkpoint_ns, checkpoint_id, digest) VALUES (?, ?, ?, ?)`,
  );
  try {
    for (const message of messages) {
      insert.run(key.threadId, key.checkpointNs, key.checkpointId, messageRef(message).digest);
    }
  } finally {
    insert.finalize();
  }
}
export function replaceWriteBlobRefs(
  db: Database,
  key: {
    threadId: string;
    checkpointNs: string;
    checkpointId: string;
    taskId: string;
    idx: number;
  },
  messages: BaseMessage[],
) {
  db.run(
    `DELETE FROM write_blob_refs
     WHERE thread_id = ? AND checkpoint_ns = ? AND checkpoint_id = ?
       AND task_id = ? AND idx = ?`,
    [key.threadId, key.checkpointNs, key.checkpointId, key.taskId, key.idx],
  );
  const insert = db.prepare(
    `INSERT OR IGNORE INTO write_blob_refs
     (thread_id, checkpoint_ns, checkpoint_id, task_id, idx, digest)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );
  try {
    for (const message of messages) {
      insert.run(
        key.threadId,
        key.checkpointNs,
        key.checkpointId,
        key.taskId,
        key.idx,
        messageRef(message).digest,
      );
    }
  } finally {
    insert.finalize();
  }
}
function internMessage(db: Database, ref: StoredMessageRef, messageJson: string) {
  db.query("INSERT OR IGNORE INTO message_blobs (digest, message_json) VALUES (?, ?)").run(
    ref.digest,
    messageJson,
  );
  const row = db
    .query<{ message_json: string }, [string]>(
      "SELECT message_json FROM message_blobs WHERE digest = ?",
    )
    .get(ref.digest);
  if (row?.message_json !== messageJson) {
    throw new Error(`消息摘要冲突：${ref.digest}`);
  }
}
