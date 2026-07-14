import { AgentDatabase } from "./infrastructure/database/agentDatabase";
import { existsSync } from "node:fs";
import { loadSettings } from "./infrastructure/configuration/loadSettings";
import { removeDatabaseDirectory } from "./infrastructure/database/connection";
import { resolveSessionPaths } from "./infrastructure/configuration/sessionPaths";
import { sessionNotFound } from "./errors";

export function deleteHostSession(sessionId: string, root = process.cwd()) {
  const settings = loadSettings(root);
  const paths = resolveSessionPaths(settings, sessionId);
  if (!existsSync(paths.dir)) {
    throw sessionNotFound(sessionId);
  }
  removeDatabaseDirectory(paths.dir);
}
export function requestHostToolCancellation(
  sessionId: string,
  callId: string,
  root = process.cwd(),
) {
  const settings = loadSettings(root);
  const paths = resolveSessionPaths(settings, sessionId);
  if (!existsSync(paths.dbPath)) {
    throw sessionNotFound(sessionId);
  }
  const db = new AgentDatabase(paths.dbPath);
  try {
    if (!db.hasSession(sessionId)) {
      throw sessionNotFound(sessionId);
    }
    db.requestToolCancellation(sessionId, callId);
  } finally {
    db.close();
  }
}
