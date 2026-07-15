import type { Database } from "bun:sqlite";

interface HookUsageRow {
  hook_id: string;
  used_count: number;
}
export function consumeHookUsage(
  db: Database,
  sessionId: string,
  hookId: string,
  limit: number,
): boolean {
  if (limit === -1) {
    return true;
  }
  return (
    db
      .query<{ used_count: number }, [string, string, number, number]>(
        `INSERT INTO hook_usage (session_id, hook_id, used_count)
         SELECT ?, ?, 1 WHERE ? > 0
         ON CONFLICT (session_id, hook_id) DO UPDATE
         SET used_count = used_count + 1
         WHERE used_count < ?
         RETURNING used_count`,
      )
      .get(sessionId, hookId, limit, limit) !== null
  );
}
export function copyHookUsage(
  source: Database,
  sourceSessionId: string,
  target: Database,
  targetSessionId: string,
) {
  const rows = source
    .query<HookUsageRow, [string]>(
      "SELECT hook_id, used_count FROM hook_usage WHERE session_id = ?",
    )
    .all(sourceSessionId);
  const insert = target.prepare(
    "INSERT INTO hook_usage (session_id, hook_id, used_count) VALUES (?, ?, ?)",
  );
  try {
    for (const row of rows) {
      insert.run(targetSessionId, row.hook_id, row.used_count);
    }
  } finally {
    insert.finalize();
  }
}
