import type { ErrorDetails } from "../failures/details";
import type { RegisteredSession } from "./registry";
import type { SessionStatus } from "../types";
export interface SessionInfo {
  id: string;
  workspace: string;
  createdAt: number;
  updatedAt: number;
  status: SessionStatus;
  error: ErrorDetails | null;
}
export function projectSession(
  session: RegisteredSession,
  activity: Extract<SessionStatus, "tool" | "model" | "idle">,
  hostError: ErrorDetails | null,
): SessionInfo {
  return {
    createdAt: session.createdAt,
    id: session.id,
    updatedAt: session.updatedAt,
    workspace: session.workspace,
    ...resolveSessionState(session, activity, hostError),
  };
}
export function resolveSessionState(
  session: Pick<RegisteredSession, "control" | "paused" | "error">,
  activity: Extract<SessionStatus, "tool" | "model" | "idle">,
  hostError: ErrorDetails | null,
) {
  return {
    error: hostError ?? session.error,
    status: resolveSessionStatus(session, activity, hostError),
  };
}
export function resolveSessionStatus(
  session: Pick<RegisteredSession, "control" | "paused" | "error">,
  activity: Extract<SessionStatus, "tool" | "model" | "idle">,
  hostError: ErrorDetails | null,
): SessionStatus {
  if (hostError || session.error) {
    return "error";
  }
  if (session.paused || session.control === "pause" || session.control === "pause_cancel") {
    return "paused";
  }
  return activity;
}
