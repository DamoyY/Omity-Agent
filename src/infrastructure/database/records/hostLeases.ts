import type { Database } from "bun:sqlite";
import { requireSessionRecord } from "./sessions";
export interface HostLeaseClaim {
  sessionId: string;
  ownerId: string;
  now: number;
  ttlMs: number;
}
export interface HostLeaseRecord {
  sessionId: string;
  ownerId: string;
  expiresAt: number;
}
interface HostLeaseRow {
  session_id: string;
  owner_id: string;
  expires_at: number;
}
export function readHostLeaseRecord(db: Database, sessionId: string): HostLeaseRecord | null {
  requireSessionRecord(db, sessionId);
  const row = db
    .query<HostLeaseRow, [string]>(
      `SELECT session_id, owner_id, expires_at
       FROM host_leases WHERE session_id = ?`,
    )
    .get(sessionId);
  return row
    ? {
        expiresAt: row.expires_at,
        ownerId: row.owner_id,
        sessionId: row.session_id,
      }
    : null;
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
export function releaseHostLeaseRecord(db: Database, sessionId: string, ownerId: string) {
  const result = db.run("DELETE FROM host_leases WHERE session_id = ? AND owner_id = ?", [
    sessionId,
    ownerId,
  ]);
  return result.changes === 1;
}
