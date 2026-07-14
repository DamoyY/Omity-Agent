import type { SessionInfo } from "./client";
const recentWorkspaceLimit = 5;
export function recentWorkspaces(sessions: SessionInfo[]) {
  return [...new Set(sessions.map(({ workspace }) => workspace))].slice(0, recentWorkspaceLimit);
}
