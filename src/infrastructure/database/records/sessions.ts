import { sessionConflict, sessionNotFound } from "../../../errors";
import type { Control } from "../../../types";
import type { Database } from "bun:sqlite";

export function createSessionRecord(db: Database, sessionId: string, workspace: string) {
  if (hasSessionRecord(db, sessionId)) {
    throw sessionConflict(sessionId);
  }
  const result = db
    .query(
      "INSERT INTO sessions (id, workspace, control, created_at, updated_at) VALUES (?, ?, 'running', unixepoch(), unixepoch())",
    )
    .run(sessionId, workspace);
  if (result.changes !== 1) {
    throw sessionConflict(sessionId);
  }
}
export function hasSessionRecord(db: Database, sessionId: string) {
  const query = db.prepare<{ value: number }, [string]>(
    "SELECT 1 AS value FROM sessions WHERE id = ?",
  );
  let row: { value: number } | null;
  try {
    row = query.get(sessionId);
  } finally {
    query.finalize();
  }
  return row !== null;
}
export function requireSessionRecord(db: Database, sessionId: string) {
  if (!hasSessionRecord(db, sessionId)) {
    throw sessionNotFound(sessionId);
  }
}
export function readWorkspaceRecord(db: Database, sessionId: string) {
  requireSessionRecord(db, sessionId);
  const row = db
    .query<{ workspace: string }, [string]>("SELECT workspace FROM sessions WHERE id = ?")
    .get(sessionId);
  if (!row) {
    throw sessionNotFound(sessionId);
  }
  return row.workspace;
}
export function touchSessionRecord(db: Database, sessionId: string) {
  requireSessionRecord(db, sessionId);
  db.query("UPDATE sessions SET updated_at = unixepoch() WHERE id = ?").run(sessionId);
}
export function readControlRecord(db: Database, sessionId: string): Control {
  requireSessionRecord(db, sessionId);
  const query = db.prepare<{ control: Control }, [string]>(
    "SELECT control FROM sessions WHERE id = ?",
  );
  let row: { control: Control } | null;
  try {
    row = query.get(sessionId);
  } finally {
    query.finalize();
  }
  if (!row) {
    throw sessionNotFound(sessionId);
  }
  return row.control;
}
export function writeControlRecord(db: Database, sessionId: string, control: Control) {
  requireSessionRecord(db, sessionId);
  db.query("UPDATE sessions SET control = ?, updated_at = unixepoch() WHERE id = ?").run(
    control,
    sessionId,
  );
}
