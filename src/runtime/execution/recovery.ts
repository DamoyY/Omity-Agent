import {
  type ProcessOwner,
  isProcessRunning,
  parseHostOwner,
} from "../../infrastructure/process/ownership";
import type { AgentDatabase } from "../../infrastructure/database/agentDatabase";

export function recoverHostSession(
  db: AgentDatabase,
  sessionId: string,
  abandonedOwner?: ProcessOwner,
) {
  const now = Date.now();
  const lease = db.hostLease(sessionId);
  const confirmedDeadOwnerId = confirmedDeadLease(lease, now, abandonedOwner);
  return db.recoverInterruptedSession({
    now,
    sessionId,
    ...(confirmedDeadOwnerId ? { confirmedDeadOwnerId } : {}),
  });
}
function confirmedDeadLease(
  lease: ReturnType<AgentDatabase["hostLease"]>,
  now: number,
  abandonedOwner?: ProcessOwner,
) {
  if (!lease || lease.expiresAt <= now) {
    return undefined;
  }
  const owner = parseHostOwner(lease.ownerId);
  const abandoned =
    owner.kind === abandonedOwner?.kind &&
    owner.instanceId === abandonedOwner.instanceId &&
    owner.pid === abandonedOwner.pid;
  return abandoned || !isProcessRunning(owner.pid) ? lease.ownerId : undefined;
}
