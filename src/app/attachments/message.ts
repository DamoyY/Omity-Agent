import { runClient } from "../../client";
import type { Settings } from "../../types";
import type { PendingAttachment } from "./contract";
import { saveMessageAttachments } from "./storage";

export async function enqueueMessageWithAttachments(
  settings: Settings,
  appRoot: string,
  sessionId: string,
  content: string,
  attachments: PendingAttachment[],
  ensureHost: () => void,
) {
  const saved = await saveMessageAttachments(
    settings,
    sessionId,
    content,
    attachments,
  );
  try {
    ensureHost();
    const result = runClient({ sessionId, append: saved.content }, appRoot);
    return { ...result, content: saved.content };
  } catch (error) {
    await saved.discard();
    throw error;
  }
}
