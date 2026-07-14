import type { Settings } from "../../types";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
export function sessionPaths(settings: Settings, sessionId: string) {
  const paths = resolveSessionPaths(settings, sessionId);
  mkdirSync(paths.dir, { recursive: true });
  return paths;
}
export function resolveSessionPaths(settings: Settings, sessionId: string) {
  const dir = resolve(settings.paths.dataDir, "sessions", safeId(sessionId));
  const dbPath = resolve(dir, "agent.sqlite");
  return { dbPath, dir };
}
export function safeId(value: string) {
  if (
    value.length === 0 ||
    value.length > 128 ||
    value === "." ||
    value === ".." ||
    !/^[a-zA-Z0-9._-]+$/.test(value)
  ) {
    throw new Error(`路径 ID 无效：${value}`);
  }
  return value;
}
