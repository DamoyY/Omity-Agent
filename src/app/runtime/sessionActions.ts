import { forkSessionStorage, removeSessionStorage } from "./sessionStorage";
import type { SessionSubmission } from "../attachments/contract";
import type { Settings } from "../../types";
import { createSessionWithAttachments } from "../attachments/session";
import { loadSettings } from "../../infrastructure/configuration/loadSettings";
import { normalizeWorkspacePath } from "../../infrastructure/configuration/workspacePath";
import { randomUUID } from "node:crypto";
export async function createAppSession(appRoot: string, submission: SessionSubmission) {
  const workspace = normalizeWorkspacePath(submission.workspace, appRoot);
  const settings = loadSettings(appRoot, { cwd: workspace });
  const sessionId = `web-${randomUUID()}`;
  await createSessionWithAttachments({
    attachments: submission.attachments,
    history: submission.history,
    message: submission.message,
    sessionId,
    settings,
    workspace,
  });
  return { sessionId, workspace };
}
export async function createAppFork(options: {
  beforeMessageId: number;
  pauseSource: () => Promise<unknown>;
  settings: Settings;
  sourceSessionId: string;
  workspace: string;
}) {
  const targetSessionId = `web-${randomUUID()}`;
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
