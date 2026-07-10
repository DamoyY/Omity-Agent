import type { Database } from "bun:sqlite";
import type { Control } from "../types";

export function createSessionRecord(
  db: Database,
  sessionId: string,
  workspace: string,
) {
  if (hasSessionRecord(db, sessionId)) {
    throw new Error(`会话已存在：${sessionId}`);
  }
  const result = db
    .query(
      "INSERT INTO sessions (id, workspace, control, status, created_at, updated_at) VALUES (?, ?, 'running', 'idle', unixepoch(), unixepoch())",
    )
    .run(sessionId, workspace);
  if (result.changes !== 1) throw new Error(`会话已存在：${sessionId}`);
}

export function ensureSessionRecord(
  db: Database,
  sessionId: string,
  workspace: string,
) {
  db.query(
    "INSERT OR IGNORE INTO sessions (id, workspace, control, status, created_at, updated_at) VALUES (?, ?, 'running', 'idle', unixepoch(), unixepoch())",
  ).run(sessionId, workspace);
}

export function hasSessionRecord(db: Database, sessionId: string) {
  const row = db
    .query<
      { value: number },
      [string]
    >("SELECT 1 AS value FROM sessions WHERE id = ?")
    .get(sessionId);
  return row !== null && row !== undefined;
}

export function requireSessionRecord(db: Database, sessionId: string) {
  if (!hasSessionRecord(db, sessionId)) {
    throw new Error(`会话不存在：${sessionId}`);
  }
}

export function touchSessionRecord(db: Database, sessionId: string) {
  requireSessionRecord(db, sessionId);
  db.query("UPDATE sessions SET updated_at = unixepoch() WHERE id = ?").run(
    sessionId,
  );
}

export function readControlRecord(db: Database, sessionId: string): Control {
  requireSessionRecord(db, sessionId);
  const row = db
    .query<
      { control: Control },
      [string]
    >("SELECT control FROM sessions WHERE id = ?")
    .get(sessionId);
  if (!row) throw new Error(`会话不存在：${sessionId}`);
  return row.control;
}

export function writeControlRecord(
  db: Database,
  sessionId: string,
  control: Control,
) {
  requireSessionRecord(db, sessionId);
  db.query(
    "UPDATE sessions SET control = ?, updated_at = unixepoch() WHERE id = ?",
  ).run(control, sessionId);
}
