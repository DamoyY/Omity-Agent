import { forkSessionStorage, removeSessionStorage } from "./sessionStorage";
import type { SessionSubmission } from "../attachments/contract";
import type { Settings } from "../../types";
import { claimShortId } from "../../infrastructure/randomId";
import { createSessionWithAttachments } from "../attachments/session";
import { loadSettings } from "../../infrastructure/configuration/loadSettings";
import { mkdirSync } from "node:fs";
import { normalizeWorkspacePath } from "../../infrastructure/configuration/workspacePath";
import { resolve } from "node:path";

export async function createAppSession(appRoot: string, submission: SessionSubmission) {
  const workspace = normalizeWorkspacePath(submission.workspace, appRoot);
  const settings = loadSettings(appRoot, { cwd: workspace });
  const sessionId = reserveSessionId(settings);
  try {
    await createSessionWithAttachments({
      attachments: submission.attachments,
      history: submission.history,
      message: submission.message,
      sessionId,
      settings,
      workspace,
    });
  } catch (error) {
    removeSessionStorage(settings, sessionId);
    throw error;
  }
  return { sessionId, workspace };
}
export async function createAppFork(options: {
  beforeMessageId: number;
  pauseSource: () => Promise<unknown>;
  settings: Settings;
  sourceSessionId: string;
  workspace: string;
}) {
  const targetSessionId = reserveSessionId(options.settings);
  let targetCreated = false;
  try {
    forkSessionStorage({
      beforeMessageId: options.beforeMessageId,
      settings: options.settings,
      sourceSessionId: options.sourceSessionId,
      targetSessionId,
      workspace: options.workspace,
    });
    targetCreated = true;
    await options.pauseSource();
  } catch (error) {
    if (targetCreated) {
      removeSessionStorage(options.settings, targetSessionId);
    }
    throw error;
  }
  return targetSessionId;
}

function reserveSessionId(settings: Settings) {
  const sessionsDir = resolve(settings.paths.dataDir, "sessions");
  mkdirSync(sessionsDir, { recursive: true });
  return claimShortId((id) => {
    try {
      mkdirSync(resolve(sessionsDir, id));
      return true;
    } catch (error) {
      if (isExistsError(error)) {
        return false;
      }
      throw error;
    }
  });
}

function isExistsError(error: unknown) {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as Error & { code?: unknown }).code === "EEXIST"
  );
}
