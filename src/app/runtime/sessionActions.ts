import { randomUUID } from "node:crypto";
import { loadSettings } from "../../infrastructure/configuration/loadSettings";
import { normalizeWorkspacePath } from "../../infrastructure/configuration/workspacePath";
import type { Settings } from "../../types";
import type { SessionSubmission } from "../attachments/contract";
import { createSessionWithAttachments } from "../attachments/session";
import { forkSessionStorage, removeSessionStorage } from "./sessionStorage";
export async function createAppSession(appRoot: string, submission: SessionSubmission) {
  const workspace = normalizeWorkspacePath(submission.workspace, appRoot);
  const settings = loadSettings(appRoot, { cwd: workspace });
  const sessionId = `web-${randomUUID()}`;
  await createSessionWithAttachments({
    settings,
    sessionId,
    workspace,
    history: submission.history,
    message: submission.message,
    attachments: submission.attachments,
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
      settings: options.settings,
      sourceSessionId: options.sourceSessionId,
      targetSessionId,
      workspace: options.workspace,
      beforeMessageId: options.beforeMessageId,
    });
    targetCreated = true;
    await options.pauseSource();
  } catch (error) {
    if (targetCreated) removeSessionStorage(options.settings, targetSessionId);
    throw error;
  }
  return targetSessionId;
}
