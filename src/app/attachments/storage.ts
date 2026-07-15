import {
  type PendingAttachment,
  attachmentIds,
  fileSuffix,
  validateAttachmentBatch,
} from "./contract";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { DomainError } from "../../errors";
import type { Settings } from "../../types";
import { claimShortIdAsync } from "../../infrastructure/randomId";
import { join } from "node:path";
import { resolveSessionPaths } from "../../infrastructure/configuration/sessionPaths";

export async function saveMessageAttachments(
  settings: Settings,
  sessionId: string,
  content: string,
  attachments: PendingAttachment[],
) {
  const referenced = attachmentIds(content);
  const selected = attachments.filter(({ id }) => referenced.has(id));
  validateSelected(selected, referenced, settings);
  if (selected.length === 0) {
    return saved(content, []);
  }
  const session = resolveSessionPaths(settings, sessionId);
  const directory = join(session.dir, "attachments");
  await mkdir(directory, { recursive: true });
  const written: string[] = [];
  let resolved = content;
  try {
    for (const { id, file } of selected) {
      const bytes = new Uint8Array(await file.arrayBuffer());
      let path = "";
      await claimShortIdAsync(async (fileId) => {
        path = join(directory, `${fileId}${fileSuffix(file.name)}`);
        try {
          await writeFile(path, bytes, { flag: "wx" });
          return true;
        } catch (error) {
          if (isExistsError(error)) {
            return false;
          }
          throw error;
        }
      });
      written.push(path);
      const displayPath = path.replaceAll("\\", "/");
      resolved = replacePlaceholder(resolved, id, displayPath);
    }
    return saved(resolved, written);
  } catch (error) {
    await Promise.all(written.map((path) => rm(path, { force: true })));
    throw error;
  }
}
function saved(content: string, paths: string[]) {
  return {
    content,
    discard: () => Promise.all(paths.map((path) => rm(path, { force: true }))),
  };
}
function validateSelected(
  selected: PendingAttachment[],
  referenced: Set<string>,
  settings: Settings,
) {
  const ids = new Set<string>();
  for (const attachment of selected) {
    if (ids.has(attachment.id)) {
      throw new DomainError("ATTACHMENT_INVALID", `附件 ID 重复：${attachment.id}`);
    }
    ids.add(attachment.id);
  }
  validateAttachmentBatch(
    selected.map(({ file }) => file),
    settings.attachments,
  );
  for (const id of referenced) {
    if (!ids.has(id)) {
      throw new DomainError("ATTACHMENT_INVALID", `消息引用的附件不存在：${id}`);
    }
  }
}
function replacePlaceholder(content: string, id: string, path: string) {
  const pattern = new RegExp(String.raw`\{\{file:${id}:[^{}\r\n]+\}\}`, "giu");
  return content.replaceAll(pattern, () => path);
}
function isExistsError(error: unknown) {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as Error & { code?: unknown }).code === "EEXIST"
  );
}
