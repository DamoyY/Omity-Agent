import type { ErrorDetails } from "../failures/details";
import type { SessionStatus } from "../types";
import type { RegisteredSession } from "./registry";

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
    id: session.id,
    workspace: session.workspace,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    ...resolveSessionState(session, activity, hostError),
  };
}

export function resolveSessionState(
  session: Pick<RegisteredSession, "control" | "paused" | "error">,
  activity: Extract<SessionStatus, "tool" | "model" | "idle">,
  hostError: ErrorDetails | null,
) {
  return {
    status: resolveSessionStatus(session, activity, hostError),
    error: hostError ?? session.error,
  };
}

export function resolveSessionStatus(
  session: Pick<RegisteredSession, "control" | "paused" | "error">,
  activity: Extract<SessionStatus, "tool" | "model" | "idle">,
  hostError: ErrorDetails | null,
): SessionStatus {
  if (hostError || session.error) return "error";
  if (
    session.paused ||
    session.control === "pause" ||
    session.control === "pause_cancel"
  ) {
    return "paused";
  }
  return activity;
}
