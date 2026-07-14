import type { PendingAttachment } from "./contract";
import type { Settings } from "../../types";
import { runClient } from "../../client";
import { saveMessageAttachments } from "./storage";
export async function enqueueMessageWithAttachments(
  settings: Settings,
  appRoot: string,
  sessionId: string,
  content: string,
  attachments: PendingAttachment[],
  ensureHost: () => Promise<void>,
) {
  const saved = await saveMessageAttachments(settings, sessionId, content, attachments);
  try {
    await ensureHost();
    const result = runClient({ append: saved.content, sessionId }, appRoot);
    return { ...result, content: saved.content };
  } catch (error) {
    await saved.discard();
    throw error;
  }
}
