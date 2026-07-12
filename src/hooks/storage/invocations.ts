import { createHash } from "node:crypto";
import type { Database } from "bun:sqlite";

export interface InvocationDetails {
  key: string;
  sessionId: string;
  threadId: string;
  hookId: string;
  trigger: string;
  sourceId: string;
}

export interface InvocationRow {
  status: string;
  output_message_id: number | null;
  error: string | null;
}

export function applyInvocationSchema(db: Database) {
  db.run(`
    CREATE TABLE IF NOT EXISTS invocations (
      invocation_key TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      thread_id TEXT NOT NULL,
      owner_id TEXT,
      lease_expires_at INTEGER,
      output_message_id INTEGER,
      error TEXT,
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
      FOREIGN KEY (output_message_id) REFERENCES messages(id)
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS hook_usage (
      session_id TEXT NOT NULL,
      hook_id TEXT NOT NULL,
      used_count INTEGER NOT NULL,
      PRIMARY KEY (session_id, hook_id),
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
    )
  `);
  db.run(
    "CREATE INDEX IF NOT EXISTS invocations_thread_id ON invocations(thread_id)",
  );
}

export function createInvocationKey(
  sessionId: string,
  threadId: string,
  details: Pick<InvocationDetails, "trigger" | "sourceId" | "hookId">,
) {
  return createHash("sha256")
    .update(
      JSON.stringify([
        sessionId,
        threadId,
        details.trigger,
        details.sourceId,
        details.hookId,
      ]),
    )
    .digest("base64url");
}

export function bindInvocation(
  sessionId: string,
  threadId: string,
  details: Pick<InvocationDetails, "trigger" | "sourceId" | "hookId">,
): InvocationDetails {
  const key = createInvocationKey(sessionId, threadId, details);
  return { key, sessionId, threadId, ...details };
}

export function insertInvocation(
  db: Database,
  details: InvocationDetails,
  runLimit: number,
  ownerId: string,
  now: number,
  leaseMs: number,
) {
  const insert = db.prepare(
    `INSERT OR IGNORE INTO invocations
     (invocation_key, session_id, thread_id, owner_id, lease_expires_at)
     SELECT ?, ?, ?, ?, ?
     WHERE ? = 'agent_tool' OR ? = -1 OR COALESCE((
       SELECT used_count FROM hook_usage WHERE session_id = ? AND hook_id = ?
     ), 0) < ?`,
  );
  const increment = db.prepare(
    `INSERT INTO hook_usage (session_id, hook_id, used_count) VALUES (?, ?, 1)
     ON CONFLICT (session_id, hook_id)
     DO UPDATE SET used_count = used_count + 1`,
  );
  const claim = db.transaction(() => {
    const result = insert.run(
      details.key,
      details.sessionId,
      details.threadId,
      ownerId,
      now + leaseMs,
      details.trigger,
      runLimit,
      details.sessionId,
      details.hookId,
      runLimit,
    );
    if (result.changes !== 1) return false;
    if (details.trigger !== "agent_tool") {
      increment.run(details.sessionId, details.hookId);
    }
    return true;
  });
  try {
    return claim.immediate();
  } finally {
    increment.finalize();
    insert.finalize();
  }
}

export function reclaimInvocation(
  db: Database,
  key: string,
  ownerId: string,
  now: number,
  leaseMs: number,
) {
  const result = db.run(
    `UPDATE invocations
     SET owner_id = ?, lease_expires_at = ?
     WHERE invocation_key = ? AND output_message_id IS NULL AND error IS NULL
       AND lease_expires_at <= ?`,
    [ownerId, now + leaseMs, key, now],
  );
  return result.changes === 1;
}

export function renewInvocation(
  db: Database,
  key: string,
  ownerId: string,
  now: number,
  leaseMs: number,
) {
  const result = db.run(
    `UPDATE invocations SET lease_expires_at = ?
     WHERE invocation_key = ? AND output_message_id IS NULL AND error IS NULL
       AND owner_id = ?`,
    [now + leaseMs, key, ownerId],
  );
  return result.changes === 1;
}

export function readInvocation(db: Database, key: string) {
  return db
    .query<InvocationRow, [string]>(
      `SELECT CASE
         WHEN output_message_id IS NOT NULL THEN 'done'
         WHEN error IS NOT NULL THEN 'error'
         ELSE 'running'
       END AS status, output_message_id, error
       FROM invocations WHERE invocation_key = ?`,
    )
    .get(key);
}
