import type { Database } from "bun:sqlite";
import { queryAll } from "./connection";

export function assertCoreSchema(db: Database) {
  assertColumns(db, "sessions", ["id", "workspace", "control", "created_at", "updated_at"]);
  assertColumns(db, "queue", ["id", "session_id", "root_id", "content", "status", "error"]);
  assertColumns(db, "composer_drafts", ["session_id", "content", "revision", "updated_at"]);
  assertColumns(db, "host_leases", ["session_id", "owner_id", "expires_at"]);
  assertColumns(db, "tool_cancellations", ["session_id", "call_id", "requested_at"]);
  assertColumns(db, "messages", [
    "id",
    "session_id",
    "source_id",
    "message_json",
    "queue_id",
    "position",
    "created_at",
  ]);
  assertColumns(db, "events", [
    "id",
    "session_id",
    "queue_id",
    "message_id",
    "part_id",
    "kind",
    "payload_json",
  ]);
  assertColumns(db, "checkpoints", [
    "thread_id",
    "checkpoint_ns",
    "checkpoint_id",
    "type",
    "checkpoint",
    "metadata",
  ]);
  assertColumns(db, "writes", [
    "thread_id",
    "checkpoint_ns",
    "checkpoint_id",
    "task_id",
    "idx",
    "channel",
    "type",
    "value",
  ]);
  assertColumns(db, "write_messages", [
    "thread_id",
    "checkpoint_ns",
    "checkpoint_id",
    "task_id",
    "idx",
    "ordinal",
    "message_id",
  ]);
}
function assertColumns(db: Database, table: string, columns: string[]) {
  const existing = new Set(
    queryAll<{ name: string }>(db, `PRAGMA table_info(${table})`).map((row) => row.name),
  );
  const missing = columns.filter((column) => !existing.has(column));
  if (missing.length > 0) {
    throw new Error(`数据库结构错误：${table} 表缺少列：${missing.join(", ")}`);
  }
}
