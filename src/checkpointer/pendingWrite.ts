import {
  type PendingWrite,
  type SerializerProtocol,
  WRITES_IDX_MAP,
} from "@langchain/langgraph-checkpoint";
import { type SqlBinding, optionalConfigString, requiredConfigString } from "./sql";
import {
  pruneUnreferencedMessages,
  storeMessage,
} from "../infrastructure/database/records/messages/history";
import { queryGet, runTransaction } from "../infrastructure/database/connection";
import type { BaseMessage } from "@langchain/core/messages";
import type { Database } from "bun:sqlite";
import type { RunnableConfig } from "@langchain/core/runnables";
import { normalizePendingValue } from "./pendingMessages";

interface PendingWriteRow {
  bindings: SqlBinding[];
  idx: number;
  messages: BaseMessage[];
  replace: boolean;
  taskId: string;
}
export interface PreparedWrites {
  checkpointId: string;
  checkpointNs: string;
  rows: PendingWriteRow[];
  sessionId: string;
  threadId: string;
}
export async function preparePendingWrites(
  serde: SerializerProtocol,
  config: RunnableConfig,
  writes: PendingWrite[],
  taskId: string,
  sessionId: string,
): Promise<PreparedWrites> {
  const threadId = requiredConfigString(config.configurable?.["thread_id"], "thread_id");
  const checkpointNs =
    optionalConfigString(config.configurable?.["checkpoint_ns"], "checkpoint_ns") ?? "";
  const checkpointId = requiredConfigString(
    config.configurable?.["checkpoint_id"],
    "checkpoint_id",
  );
  const rows = await Promise.all(
    writes.map(async ([channel, value], index) => {
      const normalized = normalizePendingValue(value);
      const [type, serialized] = await serde.dumpsTyped(normalized.value);
      const writeIndex = WRITES_IDX_MAP[channel] ?? index;
      return {
        bindings: [
          threadId,
          checkpointNs,
          checkpointId,
          taskId,
          writeIndex,
          channel,
          type,
          serialized,
        ] satisfies SqlBinding[],
        idx: writeIndex,
        messages: normalized.messages,
        replace: channel in WRITES_IDX_MAP,
        taskId,
      };
    }),
  );
  return { checkpointId, checkpointNs, rows, sessionId, threadId };
}
export function commitPendingWrites(db: Database, item: PreparedWrites) {
  const replace = writeStatement(db, "REPLACE");
  const ignore = writeStatement(db, "IGNORE");
  const link = db.prepare(
    `INSERT INTO write_messages
     (thread_id, checkpoint_ns, checkpoint_id, task_id, idx, ordinal, message_id)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  try {
    runTransaction(db, () => {
      assertCurrentCheckpoint(db, item);
      let changed = false;
      for (const row of item.rows) {
        const result = (row.replace ? replace : ignore).run(...row.bindings);
        if (result.changes === 1) {
          linkMessages(db, link, item, row);
          changed = true;
        }
      }
      if (changed) {
        pruneUnreferencedMessages(db, item.sessionId);
      }
    });
  } finally {
    replace.finalize();
    ignore.finalize();
    link.finalize();
  }
}
function writeStatement(db: Database, behavior: "IGNORE" | "REPLACE") {
  return db.prepare(
    `INSERT OR ${behavior} INTO writes
     (thread_id, checkpoint_ns, checkpoint_id, task_id, idx, channel, type, value)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  );
}
function assertCurrentCheckpoint(db: Database, item: PreparedWrites) {
  const current = queryGet<{ checkpoint_id: string }>(
    db,
    "SELECT checkpoint_id FROM checkpoints WHERE thread_id = ? AND checkpoint_ns = ?",
    item.threadId,
    item.checkpointNs,
  );
  if (current?.checkpoint_id !== item.checkpointId) {
    throw new Error(`checkpoint pending write 已过期：${item.checkpointId}`);
  }
}
function linkMessages(
  db: Database,
  link: ReturnType<Database["prepare"]>,
  item: PreparedWrites,
  row: PendingWriteRow,
) {
  row.messages.forEach((message, ordinal) => {
    const messageId = storeMessage(
      db,
      item.sessionId,
      message,
      undefined,
      undefined,
      undefined,
      "recovery",
    );
    link.run(
      item.threadId,
      item.checkpointNs,
      item.checkpointId,
      row.taskId,
      row.idx,
      ordinal,
      messageId,
    );
  });
}
