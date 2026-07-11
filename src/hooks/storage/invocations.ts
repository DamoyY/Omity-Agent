import type { Database } from "bun:sqlite";

export type InvocationDetails = {
  key: string;
  sessionId: string;
  threadId: string;
  hookId: string;
  trigger: string;
  sourceId: string;
};

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

export function canRunInvocation(
  db: Database,
  details: Pick<InvocationDetails, "key" | "sessionId" | "hookId">,
  runLimit: number,
) {
  const existing = db
    .query<{ found: number }, [string]>(
      "SELECT 1 AS found FROM invocations WHERE invocation_key = ?",
    )
    .get(details.key);
  if (existing || runLimit === -1) return true;
  const row = db
    .query<{ count: number }, [string, string]>(
      "SELECT COUNT(*) AS count FROM invocations WHERE session_id = ? AND hook_id = ? AND trigger <> 'agent_tool'",
    )
    .get(details.sessionId, details.hookId);
  if (!row) throw new Error("无法统计 Hook session 运行次数");
  return row.count < runLimit;
}

export function insertInvocation(
  db: Database,
  details: InvocationDetails,
  runLimit: number,
) {
  const result = db
    .query(
      `INSERT OR IGNORE INTO invocations
       (invocation_key, session_id, thread_id, hook_id, trigger, source_id, status, created_at, updated_at)
       SELECT ?, ?, ?, ?, ?, ?, 'running', unixepoch(), unixepoch()
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
      runLimit,
      details.sessionId,
      details.hookId,
      runLimit,
    );
  return result.changes === 1;
}
