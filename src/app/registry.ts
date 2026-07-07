import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { Database } from "bun:sqlite";
import { loadSettings } from "../infrastructure/config";

export type RegisteredSession = {
  id: string;
  workspace: string;
  createdAt: number;
  updatedAt: number;
};

type SessionRow = {
  id: string;
  workspace: string;
  created_at: number;
  updated_at: number;
};

export class AppRegistry {
  private readonly db: Database;

  constructor(appRoot: string) {
    const settings = loadSettings(appRoot);
    const path = resolve(settings.paths.dataDir, "app.sqlite");
    mkdirSync(dirname(path), { recursive: true });
    this.db = new Database(path, { create: true, strict: true });
    this.db.run("PRAGMA journal_mode = WAL");
    this.db.run(`
      CREATE TABLE IF NOT EXISTS app_sessions (
        id TEXT PRIMARY KEY,
        workspace TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `);
  }

  close() {
    this.db.close();
  }

  add(id: string, workspace: string) {
    this.db
      .query(
        "INSERT INTO app_sessions (id, workspace, created_at, updated_at) VALUES (?, ?, unixepoch(), unixepoch())",
      )
      .run(id, resolve(workspace));
    return this.require(id);
  }

  list() {
    return this.db
      .query<
        SessionRow,
        []
      >("SELECT id, workspace, created_at, updated_at FROM app_sessions ORDER BY updated_at DESC, created_at DESC")
      .all()
      .map(toSession);
  }

  require(id: string) {
    const row = this.db
      .query<
        SessionRow,
        [string]
      >("SELECT id, workspace, created_at, updated_at FROM app_sessions WHERE id = ?")
      .get(id);
    if (!row) throw new Error(`会话不存在：${id}`);
    return toSession(row);
  }

  touch(id: string) {
    this.db
      .query("UPDATE app_sessions SET updated_at = unixepoch() WHERE id = ?")
      .run(id);
  }

  remove(id: string) {
    this.require(id);
    const result = this.db
      .query("DELETE FROM app_sessions WHERE id = ?")
      .run(id);
    if (result.changes !== 1) throw new Error(`无法删除会话：${id}`);
  }
}

function toSession(row: SessionRow): RegisteredSession {
  return {
    id: row.id,
    workspace: row.workspace,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
