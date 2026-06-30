import type { SQLQueryBindings } from "bun:sqlite";
import type { CheckpointListOptions } from "@langchain/langgraph-checkpoint";
import type { RunnableConfig } from "@langchain/core/runnables";

export type SqlBinding = SQLQueryBindings;

export type CheckpointRow = {
  thread_id: string;
  checkpoint_ns: string;
  checkpoint_id: string;
  parent_checkpoint_id: string | null;
  type: string | null;
  checkpoint: Uint8Array | string;
  metadata: Uint8Array | string;
  pending_writes: string | null;
};

export type WriteJson = {
  task_id: string;
  channel: string;
  type: string | null;
  value: string | null;
};

export const setupSql = [
  `
    CREATE TABLE IF NOT EXISTS checkpoints (
      thread_id TEXT NOT NULL,
      checkpoint_ns TEXT NOT NULL DEFAULT '',
      checkpoint_id TEXT NOT NULL,
      parent_checkpoint_id TEXT,
      type TEXT,
      checkpoint BLOB,
      metadata BLOB,
      PRIMARY KEY (thread_id, checkpoint_ns, checkpoint_id)
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS writes (
      thread_id TEXT NOT NULL,
      checkpoint_ns TEXT NOT NULL DEFAULT '',
      checkpoint_id TEXT NOT NULL,
      task_id TEXT NOT NULL,
      idx INTEGER NOT NULL,
      channel TEXT NOT NULL,
      type TEXT,
      value BLOB,
      PRIMARY KEY (thread_id, checkpoint_ns, checkpoint_id, task_id, idx)
    )
  `,
] as const;

export function checkpointSelectColumns() {
  return `
    SELECT thread_id, checkpoint_ns, checkpoint_id, parent_checkpoint_id,
      type, checkpoint, metadata,
      (
        SELECT json_group_array(json_object(
          'task_id', pw.task_id,
          'channel', pw.channel,
          'type', pw.type,
          'value', CAST(pw.value AS TEXT)
        ))
        FROM writes as pw
        WHERE pw.thread_id = checkpoints.thread_id
          AND pw.checkpoint_ns = checkpoints.checkpoint_ns
          AND pw.checkpoint_id = checkpoints.checkpoint_id
      ) as pending_writes`;
}

export function selectCheckpoint(withCheckpoint: boolean) {
  return `${checkpointSelectColumns()}
    FROM checkpoints
    WHERE thread_id = ? AND checkpoint_ns = ?
    ${withCheckpoint ? "AND checkpoint_id = ?" : "ORDER BY checkpoint_id DESC LIMIT 1"}`;
}

export function filterBinding(value: unknown): SqlBinding {
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "bigint" ||
    typeof value === "boolean" ||
    value === null
  ) {
    return value;
  }
  return JSON.stringify(value);
}

export function buildListQuery(
  config: RunnableConfig,
  options?: CheckpointListOptions,
) {
  const { limit, before, filter } = options ?? {};
  const clauses: string[] = [];
  const args: SqlBinding[] = [];
  const { thread_id, checkpoint_ns } = config.configurable ?? {};
  if (thread_id) {
    clauses.push("thread_id = ?");
    args.push(thread_id);
  }
  if (checkpoint_ns !== undefined && checkpoint_ns !== null) {
    clauses.push("checkpoint_ns = ?");
    args.push(checkpoint_ns);
  }
  const beforeId = before?.configurable?.["checkpoint_id"];
  if (beforeId !== undefined) {
    clauses.push("checkpoint_id < ?");
    args.push(beforeId);
  }
  for (const [key, value] of Object.entries(filter ?? {})) {
    if (value !== undefined) {
      clauses.push("json_extract(CAST(metadata AS TEXT), ?) = ?");
      args.push(`$.${key}`, filterBinding(value));
    }
  }
  let sql = `${checkpointSelectColumns()} FROM checkpoints`;
  if (clauses.length > 0) {
    sql += ` WHERE ${clauses.join(" AND ")}`;
  }
  sql += " ORDER BY checkpoint_id DESC";
  if (limit) {
    sql += " LIMIT ?";
    args.push(limit);
  }
  return { sql, args };
}
