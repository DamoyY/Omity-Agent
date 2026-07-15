import type { CheckpointListOptions } from "@langchain/langgraph-checkpoint";
import type { RunnableConfig } from "@langchain/core/runnables";
import type { SQLQueryBindings } from "bun:sqlite";

export type SqlBinding = SQLQueryBindings;
export interface CheckpointRow {
  thread_id: string;
  checkpoint_ns: string;
  checkpoint_id: string;
  type: string;
  checkpoint: Uint8Array | string;
  metadata: Uint8Array | string;
  pending_writes: string;
}
export interface WriteJson {
  task_id: string;
  idx: number;
  channel: string;
  type: string;
  value: string;
  message_ids: number[];
}
export function checkpointSelectColumns() {
  return `
    SELECT thread_id, checkpoint_ns, checkpoint_id, type, checkpoint, metadata,
      (
        SELECT json_group_array(json_object(
          'task_id', pw.task_id,
          'idx', pw.idx,
          'channel', pw.channel,
          'type', pw.type,
          'value', CAST(pw.value AS TEXT),
          'message_ids', json(pw.message_ids)
        ))
        FROM (
          SELECT w.task_id, w.idx, w.channel, w.type, w.value,
            COALESCE((
              SELECT json_group_array(message_id)
              FROM (
                SELECT message_id FROM write_messages wm
                WHERE wm.thread_id = w.thread_id
                  AND wm.checkpoint_ns = w.checkpoint_ns
                  AND wm.checkpoint_id = w.checkpoint_id
                  AND wm.task_id = w.task_id
                  AND wm.idx = w.idx
                ORDER BY ordinal
              )
            ), '[]') AS message_ids
          FROM writes w
          WHERE w.thread_id = checkpoints.thread_id
            AND w.checkpoint_ns = checkpoints.checkpoint_ns
            AND w.checkpoint_id = checkpoints.checkpoint_id
          ORDER BY w.task_id, w.idx
        ) AS pw
      ) AS pending_writes`;
}
export function selectCheckpoint() {
  return `${checkpointSelectColumns()}
    FROM checkpoints WHERE thread_id = ? AND checkpoint_ns = ?`;
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
export function optionalConfigString(value: unknown, name: string) {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== "string") {
    throw new Error(`${name} 必须是字符串`);
  }
  return value;
}
export function requiredConfigString(value: unknown, name: string) {
  const parsed = optionalConfigString(value, name);
  if (!parsed) {
    throw new Error(`缺少 ${name}`);
  }
  return parsed;
}
export function buildListQuery(config: RunnableConfig, options?: CheckpointListOptions) {
  const { limit, filter } = options ?? {};
  const clauses: string[] = [];
  const args: SqlBinding[] = [];
  const threadId = optionalConfigString(config.configurable?.["thread_id"], "thread_id");
  const checkpointNs = optionalConfigString(
    config.configurable?.["checkpoint_ns"],
    "checkpoint_ns",
  );
  if (threadId) {
    clauses.push("thread_id = ?");
    args.push(threadId);
  }
  if (checkpointNs !== undefined) {
    clauses.push("checkpoint_ns = ?");
    args.push(checkpointNs);
  }
  const filterRecord = requireRecord(filter ?? {}, "checkpoint filter");
  for (const [key, value] of Object.entries(filterRecord)) {
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
  return { args, sql };
}
function requireRecord(value: unknown, name: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new Error(`${name} 必须是对象`);
  }
  return value;
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
