import { existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { Database } from "bun:sqlite";
import { sessionNotFound } from "../errors";
import { resolveSessionPaths } from "../infrastructure/config";
import { applySchema } from "../infrastructure/schema";
import { closeDatabase, configureDatabase } from "../infrastructure/sqlite";
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
      .map((entry) =>
        readSession(resolveSessionPaths(this.settings, entry.name).dbPath),
      )
      .sort(
        (left, right) =>
          right.updatedAt - left.updatedAt || right.createdAt - left.createdAt,
      );
  }

  require(id: string) {
    const paths = resolveSessionPaths(this.settings, id);
    return readSession(paths.dbPath, id);
  }
}

function readSession(dbPath: string, id?: string) {
  if (!existsSync(dbPath)) throw sessionNotFound(id ?? dbPath);
  const db = new Database(dbPath, { create: false, strict: true });
  try {
    configureDatabase(db);
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
    if (!row) throw sessionNotFound(id ?? dbPath);
    return toSession(row);
  } finally {
    closeDatabase(db);
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
