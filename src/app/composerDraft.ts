import { queryGet, runTransaction } from "../infrastructure/database/connection";
import { AgentDatabase } from "../infrastructure/database/agentDatabase";
import type { Database } from "bun:sqlite";
import type { Settings } from "../types";
import { resolveSessionPaths } from "../infrastructure/configuration/sessionPaths";

export function readSessionDraft(settings: Settings, sessionId: string) {
  return withSessionDatabase(settings, sessionId, (db) => {
    const row = queryGet<{ content: string; revision: number }>(
      db,
      "SELECT content, revision FROM composer_drafts WHERE session_id = ?",
      sessionId,
    );
    if (!row) {
      return { content: null, revision: 0 };
    }
    return {
      content: row.content.length > 0 ? row.content : null,
      revision: row.revision,
    };
  });
}
export function writeSessionDraft(
  settings: Settings,
  sessionId: string,
  content: string,
  revision: number,
) {
  return withSessionDatabase(settings, sessionId, (db) =>
    runTransaction(db, () => {
      db.run(
        `INSERT INTO composer_drafts (session_id, content, revision, updated_at)
         VALUES (?, ?, ?, unixepoch())
         ON CONFLICT(session_id) DO UPDATE SET
           content = excluded.content,
           revision = excluded.revision,
           updated_at = excluded.updated_at
         WHERE excluded.revision > composer_drafts.revision`,
        [sessionId, content, revision],
      );
      const row = queryGet<{ revision: number }>(
        db,
        "SELECT revision FROM composer_drafts WHERE session_id = ?",
        sessionId,
      );
      if (!row) {
        throw new Error(`Composer 草稿保存失败：${sessionId}`);
      }
      return row;
    }),
  );
}
export function clearSessionDraft(settings: Settings, sessionId: string, revision: number) {
  withSessionDatabase(settings, sessionId, (db) => {
    db.run(
      `INSERT INTO composer_drafts (session_id, content, revision, updated_at)
       VALUES (?, '', ?, unixepoch())
       ON CONFLICT(session_id) DO UPDATE SET
         content = '',
         revision = excluded.revision,
         updated_at = excluded.updated_at
       WHERE excluded.revision >= composer_drafts.revision`,
      [sessionId, revision],
    );
  });
}
function withSessionDatabase<T>(
  settings: Settings,
  sessionId: string,
  operation: (db: Database) => T,
) {
  const { dbPath } = resolveSessionPaths(settings, sessionId);
  const database = new AgentDatabase(dbPath);
  try {
    return operation(database.db);
  } finally {
    database.close();
  }
}
