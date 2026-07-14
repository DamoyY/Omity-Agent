import type { Database } from "bun:sqlite";
import { assertCoreSchema } from "./validateSchema";
export const migrationSql = [
  `
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      workspace TEXT NOT NULL,
      control TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      root_id INTEGER,
      content TEXT,
      status TEXT NOT NULL,
      error TEXT,
      FOREIGN KEY (session_id) REFERENCES sessions(id),
      FOREIGN KEY (root_id) REFERENCES queue(id)
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS composer_drafts (
      session_id TEXT PRIMARY KEY,
      content TEXT NOT NULL,
      revision INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS message_blobs (
      digest TEXT PRIMARY KEY,
      message_json TEXT NOT NULL
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      source_id TEXT NOT NULL,
      blob_digest TEXT NOT NULL,
      queue_id INTEGER,
      position INTEGER,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (session_id) REFERENCES sessions(id),
      FOREIGN KEY (blob_digest) REFERENCES message_blobs(digest),
      FOREIGN KEY (queue_id) REFERENCES queue(id),
      UNIQUE (session_id, source_id, blob_digest),
      UNIQUE (session_id, position),
      UNIQUE (queue_id)
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      queue_id INTEGER NOT NULL,
      message_id TEXT,
      kind TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
      FOREIGN KEY (queue_id) REFERENCES queue(id) ON DELETE CASCADE
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS host_leases (
      session_id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS tool_cancellations (
      session_id TEXT NOT NULL,
      call_id TEXT NOT NULL,
      requested_at INTEGER NOT NULL,
      PRIMARY KEY (session_id, call_id),
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS hook_usage (
      session_id TEXT NOT NULL,
      hook_id TEXT NOT NULL,
      used_count INTEGER NOT NULL,
      PRIMARY KEY (session_id, hook_id),
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
    )
  `,
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
  `
    CREATE TABLE IF NOT EXISTS checkpoint_blob_refs (
      thread_id TEXT NOT NULL,
      checkpoint_ns TEXT NOT NULL,
      checkpoint_id TEXT NOT NULL,
      digest TEXT NOT NULL,
      PRIMARY KEY (thread_id, checkpoint_ns, checkpoint_id, digest),
      FOREIGN KEY (thread_id, checkpoint_ns, checkpoint_id)
        REFERENCES checkpoints(thread_id, checkpoint_ns, checkpoint_id)
        ON DELETE CASCADE,
      FOREIGN KEY (digest) REFERENCES message_blobs(digest)
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS write_blob_refs (
      thread_id TEXT NOT NULL,
      checkpoint_ns TEXT NOT NULL,
      checkpoint_id TEXT NOT NULL,
      task_id TEXT NOT NULL,
      idx INTEGER NOT NULL,
      digest TEXT NOT NULL,
      PRIMARY KEY (
        thread_id, checkpoint_ns, checkpoint_id, task_id, idx, digest
      ),
      FOREIGN KEY (thread_id, checkpoint_ns, checkpoint_id, task_id, idx)
        REFERENCES writes(thread_id, checkpoint_ns, checkpoint_id, task_id, idx)
        ON DELETE CASCADE,
      FOREIGN KEY (digest) REFERENCES message_blobs(digest)
    )
  `,
] as const;
export function applySchema(db: Database) {
  for (const sql of migrationSql) {
    db.run(sql);
  }
  assertCoreSchema(db);
}
