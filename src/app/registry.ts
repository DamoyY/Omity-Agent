import { existsSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { Database } from "bun:sqlite";
import { sessionNotFound } from "../errors";
import { resolveSessionPaths } from "../infrastructure/config";
import { applySchema } from "../infrastructure/schema";
import type { Settings } from "../types";

export interface RegisteredSession {
  id: string;
  workspace: string;
  createdAt: number;
  updatedAt: number;
}

interface SessionRow {
  id: string;
  workspace: string;
  created_at: number;
  updated_at: number;
}

export class AppRegistry {
  private readonly sessionsDir: string;

  constructor(private readonly settings: Settings) {
    this.sessionsDir = resolve(settings.paths.dataDir, "sessions");
  }

  list() {
    if (!existsSync(this.sessionsDir)) return [];
    return readdirSync(this.sessionsDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => readSession(join(this.sessionsDir, entry.name)))
      .sort(
        (left, right) =>
          right.updatedAt - left.updatedAt || right.createdAt - left.createdAt,
      );
  }

  require(id: string) {
    const paths = resolveSessionPaths(this.settings, id);
    return readSession(paths.dir, id);
  }
}

function readSession(dir: string, id?: string) {
  const dbPath = resolve(dir, "agent.sqlite");
  if (!existsSync(dbPath)) throw sessionNotFound(id ?? dir);
  const db = new Database(dbPath, { create: false, strict: true });
  try {
    try {
      applySchema(db);
    } catch (error) {
      console.error(
        `无法读取会话数据库 ${dbPath}：${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      throw error;
    }
    const row = id
      ? db
          .query<SessionRow, [string]>(
            "SELECT id, workspace, created_at, updated_at FROM sessions WHERE id = ?",
          )
          .get(id)
      : db
          .query<SessionRow, []>(
            "SELECT id, workspace, created_at, updated_at FROM sessions LIMIT 1",
          )
          .get();
    if (!row) throw sessionNotFound(id ?? dir);
    return toSession(row);
  } finally {
    db.close();
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
