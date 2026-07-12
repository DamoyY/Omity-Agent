import type { HonoRequest } from "hono/request";
import { z } from "zod";
import { safeId } from "../../infrastructure/configuration/sessionPaths";
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
  request: HonoRequest,
  schema: z.ZodType<T>,
): Promise<T> {
  let parsed: unknown;
  try {
    parsed = await request.json<unknown>();
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
