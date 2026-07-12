import type { IncomingMessage } from "node:http";
import { z } from "zod";
import { safeId } from "../../infrastructure/config";
import { HttpError } from "./errors";

export const requestBodyLimit = 1024 * 1024;

export const createSessionBody = z
  .object({ workspace: z.string().trim().min(1).max(32_767) })
  .strict();
export const messageBody = z
  .object({
    content: z.string().refine((value) => value.trim().length > 0),
    draftRevision: z.number().int().nonnegative(),
  })
  .strict();
export const composerDraftBody = z
  .object({
    content: z.string(),
    revision: z.number().int().positive(),
  })
  .strict();
export const controlBody = z
  .object({ control: z.enum(["running", "pause", "cancel"]) })
  .strict();
export const forkBody = z
  .object({ beforeMessageId: z.number().int().positive() })
  .strict();

export async function readJson<T>(
  req: IncomingMessage,
  schema: z.ZodType<T>,
): Promise<T> {
  const declared = contentLength(req);
  if (declared > requestBodyLimit) bodyTooLarge();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for await (const chunk of req) {
    if (!(chunk instanceof Uint8Array)) {
      throw new HttpError(400, "请求体数据块无效");
    }
    const buffer: Uint8Array = chunk;
    total += buffer.byteLength;
    if (total > requestBodyLimit) bodyTooLarge();
    chunks.push(buffer);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } catch {
    throw new HttpError(400, "请求体不是有效的 JSON");
  }
  const result = schema.safeParse(parsed);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `${issue.path.join(".") || "body"}: ${issue.message}`)
      .join("; ");
    throw new HttpError(400, `请求参数无效：${details}`);
  }
  return result.data;
}

export function decodeSessionId(value: string) {
  let decoded: string;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    throw new HttpError(400, "Session ID 编码无效");
  }
  try {
    return safeId(decoded);
  } catch (error) {
    throw new HttpError(
      400,
      error instanceof Error ? error.message : String(error),
    );
  }
}

function contentLength(req: IncomingMessage) {
  const value = req.headers["content-length"];
  if (value === undefined) return 0;
  if (Array.isArray(value) || !/^\d+$/.test(value)) {
    throw new HttpError(400, "Content-Length 无效");
  }
  const length = Number(value);
  if (!Number.isSafeInteger(length)) {
    throw new HttpError(400, "Content-Length 无效");
  }
  return length;
}

function bodyTooLarge(): never {
  throw new HttpError(
    413,
    `请求体不能超过 ${requestBodyLimit.toString()} 字节`,
  );
}
