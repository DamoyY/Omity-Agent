import type { ErrorDetails } from "../failures/details";
import type { SessionStatus } from "../types";
import type { RegisteredSession } from "./registry";

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
