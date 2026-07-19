import { DomainError } from "../../errors";
import type { InitialMessagePair } from "../initialState";

export interface PendingAttachment {
  id: string;
  file: File;
}
export interface MessageSubmission {
  content: string;
  draftRevision: number;
  attachments: PendingAttachment[];
}
export interface SessionSubmission {
  workspace: string;
  history: InitialMessagePair[];
  message: string;
  attachments: PendingAttachment[];
}
export interface AttachmentSettings {
  allowedSuffixes: string[];
  maxSizeBytes: number;
}
interface AttachmentMetadata {
  name: string;
  size: number;
}
export function appendAttachments(body: FormData, attachments: PendingAttachment[]) {
  for (const { id, file } of attachments) {
    body.append(`file:${id}`, file);
  }
}
const placeholderPattern = /\{\{file:(?<id>[0-9a-z]{8}):(?<name>[^{}\r\n]+)\}\}/giu;
export function attachmentPlaceholder(id: string, name: string) {
  return `{{file:${id}:${name.replaceAll(/[{}\r\n]/gu, "_")}}}`;
}
export function attachmentIds(content: string) {
  return new Set(
    [...content.matchAll(placeholderPattern)].map((match) =>
      (match.groups?.["id"] ?? "").toLowerCase(),
    ),
  );
}
export function fileSuffix(name: string) {
  const index = name.lastIndexOf(".");
  return index > 0 ? name.slice(index).toLowerCase() : "";
}
export function validateAttachment(
  file: unknown,
  settings: AttachmentSettings,
): asserts file is AttachmentMetadata {
  if (
    typeof file !== "object" ||
    file === null ||
    !("name" in file) ||
    typeof file.name !== "string" ||
    file.name.length === 0
  ) {
    throw new DomainError("ATTACHMENT_INVALID", "附件缺少有效文件名");
  }
  if (
    !("size" in file) ||
    typeof file.size !== "number" ||
    !Number.isSafeInteger(file.size) ||
    file.size < 0
  ) {
    throw new DomainError("ATTACHMENT_INVALID", `附件 ${file.name} 的大小无效`);
  }
  const suffix = fileSuffix(file.name);
  if (!settings.allowedSuffixes.includes(suffix)) {
    throw new DomainError(
      "ATTACHMENT_INVALID",
      `不允许粘贴后缀为 ${suffix || "（无后缀）"} 的文件`,
    );
  }
  if (file.size > settings.maxSizeBytes) {
    throw new DomainError(
      "ATTACHMENT_TOO_LARGE",
      `文件 ${file.name} 超过大小上限 ${settings.maxSizeBytes.toString()} 字节`,
    );
  }
}
export function validateAttachmentBatch(files: readonly unknown[], settings: AttachmentSettings) {
  let total = 0;
  for (const file of files) {
    validateAttachment(file, settings);
    total += file.size;
  }
  if (!Number.isSafeInteger(total)) {
    throw new DomainError("ATTACHMENT_TOO_LARGE", "附件总大小超出安全整数范围");
  }
  if (total > settings.maxSizeBytes) {
    throw new DomainError(
      "ATTACHMENT_TOO_LARGE",
      `附件总大小超过上限 ${settings.maxSizeBytes.toString()} 字节`,
    );
  }
}
