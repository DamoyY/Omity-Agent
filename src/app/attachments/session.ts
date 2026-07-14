import type { Settings } from "../../types";
import type { InitialMessagePair } from "../initialState";
import { createSessionStorage, removeSessionStorage } from "../runtime/sessionStorage";
import type { PendingAttachment } from "./contract";
import { saveMessageAttachments } from "./storage";

export async function createSessionWithAttachments(options: {
  settings: Settings;
  sessionId: string;
  workspace: string;
  history: InitialMessagePair[];
  message: string;
  attachments: PendingAttachment[];
}) {
  const saved = await saveMessageAttachments(
    options.settings,
    options.sessionId,
    options.message,
    options.attachments,
  );
  try {
    createSessionStorage(
      options.settings,
      options.sessionId,
      options.workspace,
      options.history,
      saved.content,
    );
  } catch (error) {
    await saved.discard();
    removeSessionStorage(options.settings, options.sessionId);
    throw error;
  }
}
