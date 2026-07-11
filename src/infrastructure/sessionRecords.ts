import type { Database } from "bun:sqlite";
import type { Control } from "../types";

export type HostLeaseClaim = {
  sessionId: string;
  ownerId: string;
  now: number;
  ttlMs: number;
};

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
  const query = db.prepare<{ value: number }, [string]>(
    "SELECT 1 AS value FROM sessions WHERE id = ?",
  );
  let row: { value: number } | null;
  try {
    row = query.get(sessionId);
  } finally {
    query.finalize();
  }
  return row !== null && row !== undefined;
}

export function requireSessionRecord(db: Database, sessionId: string) {
  if (!hasSessionRecord(db, sessionId)) {
    throw new Error(`会话不存在：${sessionId}`);
  }
}

export function readWorkspaceRecord(db: Database, sessionId: string) {
  requireSessionRecord(db, sessionId);
  const row = db
    .query<{ workspace: string }, [string]>(
      "SELECT workspace FROM sessions WHERE id = ?",
    )
    .get(sessionId);
  if (!row) throw new Error(`会话不存在：${sessionId}`);
  return row.workspace;
}

export function touchSessionRecord(db: Database, sessionId: string) {
  requireSessionRecord(db, sessionId);
  db.query("UPDATE sessions SET updated_at = unixepoch() WHERE id = ?").run(
    sessionId,
  );
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

export function acquireHostLeaseRecord(db: Database, claim: HostLeaseClaim) {
  requireSessionRecord(db, claim.sessionId);
  const result = db.run(
    `INSERT INTO host_leases (session_id, owner_id, expires_at)
     VALUES (?, ?, ?)
     ON CONFLICT(session_id) DO UPDATE SET
       owner_id = excluded.owner_id,
       expires_at = excluded.expires_at
     WHERE host_leases.owner_id = excluded.owner_id
        OR host_leases.expires_at <= ?`,
    [claim.sessionId, claim.ownerId, claim.now + claim.ttlMs, claim.now],
  );
  return result.changes === 1;
}

export function renewHostLeaseRecord(db: Database, claim: HostLeaseClaim) {
  const result = db.run(
    "UPDATE host_leases SET expires_at = ? WHERE session_id = ? AND owner_id = ?",
    [claim.now + claim.ttlMs, claim.sessionId, claim.ownerId],
  );
  return result.changes === 1;
}

export function releaseHostLeaseRecord(
  db: Database,
  sessionId: string,
  ownerId: string,
) {
  const result = db.run(
    "DELETE FROM host_leases WHERE session_id = ? AND owner_id = ?",
    [sessionId, ownerId],
  );
  return result.changes === 1;
}
