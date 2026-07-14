import { randomUUID } from "node:crypto";
import { z } from "zod";
const ownerSchema = z.object({
  hostId: z.uuid(),
  instanceId: z.uuid(),
  kind: z.enum(["app", "standalone"]),
  pid: z.number().int().positive(),
});
export interface ProcessOwner {
  instanceId: string;
  kind: "app" | "standalone";
  pid: number;
}
export type HostOwner = ProcessOwner & { hostId: string };
export function hostOwnerId(owner: ProcessOwner) {
  return JSON.stringify({ ...owner, hostId: randomUUID() });
}
export function parseHostOwner(value: string): HostOwner {
  const parsed: unknown = JSON.parse(value);
  const result = ownerSchema.safeParse(parsed);
  if (!result.success) throw new Error("Host Lease owner_id 无效");
  return result.data;
}
export function standaloneOwner(): ProcessOwner {
  return { instanceId: randomUUID(), kind: "standalone", pid: process.pid };
}
export function appOwner(): ProcessOwner {
  return { instanceId: randomUUID(), kind: "app", pid: process.pid };
}
export function isProcessRunning(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (isErrorCode(error, "ESRCH")) return false;
    if (isErrorCode(error, "EPERM")) return true;
    throw error;
  }
}
function isErrorCode(error: unknown, code: string) {
  return (
    error instanceof Error && "code" in error && (error as Error & { code?: unknown }).code === code
  );
}
