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
  output_json: string | null;
  error: string | null;
}

export function applyInvocationSchema(db: Database) {
  db.run(`
    CREATE TABLE IF NOT EXISTS invocations (
      invocation_key TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      thread_id TEXT NOT NULL,
      hook_id TEXT NOT NULL,
      trigger TEXT NOT NULL,
      source_id TEXT NOT NULL,
      status TEXT NOT NULL,
      owner_id TEXT NOT NULL,
      lease_expires_at INTEGER NOT NULL,
      output_json TEXT,
      error TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);
}

export function createInvocationKey(
  sessionId: string,
  threadId: string,
  details: Pick<InvocationDetails, "trigger" | "sourceId" | "hookId">,
) {
  return [
    sessionId,
    threadId,
    details.trigger,
    details.sourceId,
    details.hookId,
  ].join("\u001f");
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
  const result = db
    .query(
      `INSERT OR IGNORE INTO invocations
       (invocation_key, session_id, thread_id, hook_id, trigger, source_id,
        status, owner_id, lease_expires_at, created_at, updated_at)
       SELECT ?, ?, ?, ?, ?, ?, 'running', ?, ?, unixepoch(), unixepoch()
       WHERE ? = -1 OR (
         SELECT COUNT(*) FROM invocations
         WHERE session_id = ? AND hook_id = ? AND trigger <> 'agent_tool'
       ) < ?`,
    )
    .run(
      details.key,
      details.sessionId,
      details.threadId,
      details.hookId,
      details.trigger,
      details.sourceId,
      ownerId,
      now + leaseMs,
      runLimit,
      details.sessionId,
      details.hookId,
      runLimit,
    );
  return result.changes === 1;
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
     SET owner_id = ?, lease_expires_at = ?, updated_at = unixepoch()
     WHERE invocation_key = ? AND status = 'running'
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
    `UPDATE invocations SET lease_expires_at = ?, updated_at = unixepoch()
     WHERE invocation_key = ? AND status = 'running' AND owner_id = ?`,
    [now + leaseMs, key, ownerId],
  );
  return result.changes === 1;
}

export function readInvocation(db: Database, key: string) {
  return db
    .query<InvocationRow, [string]>(
      "SELECT status, output_json, error FROM invocations WHERE invocation_key = ?",
    )
    .get(key);
}
