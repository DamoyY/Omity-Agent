import type { Database } from "bun:sqlite";
import type { Settings } from "../types";
import { resolveSessionPaths } from "../infrastructure/configuration/sessionPaths";
import { AgentDatabase } from "../infrastructure/database/agentDatabase";

export function readSessionDraft(settings: Settings, sessionId: string) {
  return withSessionDatabase(settings, sessionId, (db) => {
    const row = db
      .query<{ content: string; revision: number }, [string]>(
        "SELECT content, revision FROM composer_drafts WHERE session_id = ?",
      )
      .get(sessionId);
    return row ?? { content: null, revision: 0 };
  });
}

export function writeSessionDraft(
  settings: Settings,
  sessionId: string,
  content: string,
  revision: number,
) {
  return withSessionDatabase(settings, sessionId, (db) => {
    const save = db.transaction(() => {
      db.run(
        `INSERT INTO composer_drafts (session_id, content, revision, updated_at)
         VALUES (?, ?, ?, unixepoch())
         ON CONFLICT(session_id) DO UPDATE SET
           content = excluded.content,
           revision = excluded.revision,
           updated_at = excluded.updated_at
         WHERE excluded.revision >= composer_drafts.revision`,
        [sessionId, content, revision],
      );
      const row = db
        .query<{ revision: number }, [string]>(
          "SELECT revision FROM composer_drafts WHERE session_id = ?",
        )
        .get(sessionId);
      if (!row) throw new Error(`Composer 草稿保存失败：${sessionId}`);
      return row;
    });
    return save();
  });
}

export function clearSessionDraft(
  settings: Settings,
  sessionId: string,
  revision: number,
) {
  withSessionDatabase(settings, sessionId, (db) => {
    db.query(
      "DELETE FROM composer_drafts WHERE session_id = ? AND revision <= ?",
    ).run(sessionId, revision);
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
