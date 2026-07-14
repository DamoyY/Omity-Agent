import type { Settings } from "../../types";
import { resolveSessionPaths, sessionPaths } from "../../infrastructure/configuration/sessionPaths";
import { AgentDatabase } from "../../infrastructure/database/agentDatabase";
import { removeDatabaseDirectory } from "../../infrastructure/database/connection";
import { initializeConversation } from "../../infrastructure/database/initialConversation";
import { forkDatabaseBeforeMessage } from "../fork";
import { initialHistory, type InitialMessagePair } from "../initialState";
export function createSessionStorage(
  settings: Settings,
  sessionId: string,
  workspace: string,
  history: InitialMessagePair[],
  message: string,
) {
  const paths = sessionPaths(settings, sessionId);
  const db = new AgentDatabase(paths.dbPath);
  let initialized = false;
  try {
    db.createSession(sessionId, workspace);
    initializeConversation(db.db, sessionId, initialHistory(history), message);
    initialized = true;
  } finally {
    db.close();
    if (!initialized) removeDatabaseDirectory(paths.dir);
  }
}
export function forkSessionStorage({
  settings,
  sourceSessionId,
  targetSessionId,
  workspace,
  beforeMessageId,
}: {
  settings: Settings;
  sourceSessionId: string;
  targetSessionId: string;
  workspace: string;
  beforeMessageId: number;
}) {
  const sourcePaths = resolveSessionPaths(settings, sourceSessionId);
  const targetPaths = sessionPaths(settings, targetSessionId);
  let created = false;
  let source: AgentDatabase | undefined;
  let target: AgentDatabase | undefined;
  try {
    source = new AgentDatabase(sourcePaths.dbPath);
    target = new AgentDatabase(targetPaths.dbPath);
    forkDatabaseBeforeMessage({
      source,
      target,
      sourceSessionId,
      targetSessionId,
      workspace,
      beforeMessageId,
    });
    created = true;
  } finally {
    try {
      try {
        target?.close();
      } finally {
        source?.close();
      }
    } finally {
      if (!created) removeDatabaseDirectory(targetPaths.dir);
    }
  }
}
export function removeSessionStorage(settings: Settings, sessionId: string) {
  removeDatabaseDirectory(resolveSessionPaths(settings, sessionId).dir);
}
