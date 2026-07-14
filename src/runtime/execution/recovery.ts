import type { AgentDatabase } from "../../infrastructure/database/agentDatabase";
import {
  isProcessRunning,
  parseHostOwner,
  type ProcessOwner,
} from "../../infrastructure/process/ownership";
export function recoverHostSession(
  db: AgentDatabase,
  sessionId: string,
  abandonedOwner?: ProcessOwner,
) {
  const now = Date.now();
  const lease = db.hostLease(sessionId);
  const confirmedDeadOwnerId = confirmedDeadLease(lease, now, abandonedOwner);
  return db.recoverInterruptedSession({
    sessionId,
    now,
    ...(confirmedDeadOwnerId ? { confirmedDeadOwnerId } : {}),
  });
}
function confirmedDeadLease(
  lease: ReturnType<AgentDatabase["hostLease"]>,
  now: number,
  abandonedOwner?: ProcessOwner,
) {
  if (!lease || lease.expiresAt <= now) return undefined;
  const owner = parseHostOwner(lease.ownerId);
  const abandoned =
    owner.kind === abandonedOwner?.kind &&
    owner.instanceId === abandonedOwner.instanceId &&
    owner.pid === abandonedOwner.pid;
  return abandoned || !isProcessRunning(owner.pid) ? lease.ownerId : undefined;
}
