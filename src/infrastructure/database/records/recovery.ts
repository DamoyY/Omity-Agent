import {
  type HostLeaseClaim,
  type HostLeaseRecord,
  acquireHostLeaseRecord,
  readHostLeaseRecord,
  releaseHostLeaseRecord,
  renewHostLeaseRecord,
} from "./hostLeases";
import { activeQueueRows, pauseRunRecord } from "./queue/runs";
import { readControlRecord, writeControlRecord } from "./sessions";
import type { Database } from "bun:sqlite";
import type { ErrorDetails } from "../../../failures/details";
import { pruneMessageBlobs } from "./messages/blobStore";
export interface InterruptedSessionClaim {
  sessionId: string;
  now: number;
  confirmedDeadOwnerId?: string;
}
export type InterruptedSessionRecovery =
  | { status: "blocked"; lease: HostLeaseRecord }
  | {
      status: "recovered";
      action: "paused" | "canceled" | "none";
      activeItems: number;
    };
export function recoverInterruptedSessionRecord(
  db: Database,
  claim: InterruptedSessionClaim,
): InterruptedSessionRecovery {
  const lease = readHostLeaseRecord(db, claim.sessionId);
  if (lease && lease.expiresAt > claim.now && lease.ownerId !== claim.confirmedDeadOwnerId) {
    return { lease, status: "blocked" };
  }
  const active = activeQueueRows(db, claim.sessionId);
  const control = readControlRecord(db, claim.sessionId);
  let action: "paused" | "canceled" | "none" = "none";
  if (control === "cancel") {
    cancelActiveRuns(db, claim.sessionId, active);
    writeControlRecord(db, claim.sessionId, "running");
    action = active.length > 0 ? "canceled" : "none";
  } else if (active.length > 0) {
    db.run(
      `UPDATE queue SET status = 'paused'
       WHERE session_id = ? AND status = 'running'`,
      [claim.sessionId],
    );
    writeControlRecord(db, claim.sessionId, "pause");
    action = "paused";
  } else if (control === "pause_cancel") {
    writeControlRecord(db, claim.sessionId, "pause");
  }
  if (lease) {
    db.run("DELETE FROM host_leases WHERE session_id = ? AND owner_id = ?", [
      claim.sessionId,
      lease.ownerId,
    ]);
  }
  return { action, activeItems: active.length, status: "recovered" };
}
function cancelActiveRuns(
  db: Database,
  sessionId: string,
  active: ReturnType<typeof activeQueueRows>,
) {
  if (active.length === 0) {
    return;
  }
  db.run(
    `UPDATE queue SET status = 'canceled', error = NULL
     WHERE session_id = ? AND status IN ('pending', 'running', 'paused')`,
    [sessionId],
  );
  const threadIds = new Set(active.map((item) => `${sessionId}:${String(item.runId ?? item.id)}`));
  const removeCheckpoint = db.prepare("DELETE FROM checkpoints WHERE thread_id = ?");
  const removeWrites = db.prepare("DELETE FROM writes WHERE thread_id = ?");
  try {
    for (const threadId of threadIds) {
      removeCheckpoint.run(threadId);
      removeWrites.run(threadId);
    }
  } finally {
    removeCheckpoint.finalize();
    removeWrites.finalize();
  }
  const removeEvent = db.prepare("DELETE FROM events WHERE queue_id = ?");
  try {
    for (const item of active) {
      removeEvent.run(item.id);
    }
  } finally {
    removeEvent.finalize();
  }
  pruneMessageBlobs(db);
}
export class RecoverableDatabase {
  constructor(readonly db: Database) {}
  hostLease(sessionId: string) {
    return readHostLeaseRecord(this.db, sessionId);
  }
  activeQueue(sessionId: string) {
    return activeQueueRows(this.db, sessionId);
  }
  pauseRun(sessionId: string, runId: number, error?: ErrorDetails) {
    return this.db.transaction(() => {
      writeControlRecord(this.db, sessionId, "pause");
      return pauseRunRecord(this.db, sessionId, runId, error);
    })();
  }
  recoverInterruptedSession(claim: InterruptedSessionClaim) {
    return this.db.transaction(() => recoverInterruptedSessionRecord(this.db, claim))();
  }
  acquireHostLease(claim: HostLeaseClaim) {
    return acquireHostLeaseRecord(this.db, claim);
  }
  renewHostLease(claim: HostLeaseClaim) {
    return renewHostLeaseRecord(this.db, claim);
  }
  releaseHostLease(sessionId: string, ownerId: string) {
    return releaseHostLeaseRecord(this.db, sessionId, ownerId);
  }
}
