import type { SessionInfo } from "../../services/client";
export interface SessionGroup {
  workspace: string;
  sessions: SessionInfo[];
  runningCount: number;
  updatedAt: number;
}
export function isRunning(session: SessionInfo) {
  return session.status === "model" || session.status === "tool";
}
export function groupSessions(sessions: SessionInfo[]): SessionGroup[] {
  const byWorkspace = new Map<string, SessionInfo[]>();
  for (const session of sessions) {
    const group = byWorkspace.get(session.workspace);
    if (group) group.push(session);
    else byWorkspace.set(session.workspace, [session]);
  }
  return [...byWorkspace].map(toGroup).sort(compareGroups);
}
export function workspaceLabel(workspace: string) {
  const parts = workspace.split(/[\\/]+/u).filter(Boolean);
  return parts.at(-1) ?? workspace;
}
export function sessionLabel(id: string) {
  return id.slice(-6).toUpperCase();
}
export function formatUpdatedAt(updatedAt: number, locale: string, now = Date.now()) {
  const elapsedSeconds = Math.max(0, Math.floor(now / 1000) - updatedAt);
  const formatter = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  if (elapsedSeconds < 60) return formatter.format(0, "second");
  if (elapsedSeconds < 3600) return formatter.format(-Math.floor(elapsedSeconds / 60), "minute");
  if (elapsedSeconds < 86_400) return formatter.format(-Math.floor(elapsedSeconds / 3600), "hour");
  if (elapsedSeconds < 604_800)
    return formatter.format(-Math.floor(elapsedSeconds / 86_400), "day");
  return new Intl.DateTimeFormat(locale, {
    month: "numeric",
    day: "numeric",
  }).format(updatedAt * 1000);
}
function toGroup([workspace, source]: [string, SessionInfo[]]): SessionGroup {
  const sessions = [...source].sort(compareSessions);
  return {
    workspace,
    sessions,
    runningCount: sessions.filter(isRunning).length,
    updatedAt: Math.max(...sessions.map(({ updatedAt }) => updatedAt)),
  };
}
function compareSessions(left: SessionInfo, right: SessionInfo) {
  return (
    Number(isRunning(right)) - Number(isRunning(left)) ||
    right.updatedAt - left.updatedAt ||
    right.createdAt - left.createdAt ||
    left.id.localeCompare(right.id)
  );
}
function compareGroups(left: SessionGroup, right: SessionGroup) {
  return (
    Number(right.runningCount > 0) - Number(left.runningCount > 0) ||
    right.updatedAt - left.updatedAt ||
    left.workspace.localeCompare(right.workspace)
  );
}
