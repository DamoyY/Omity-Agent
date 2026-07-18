import { reportError } from "./errors";
import { z } from "./validation";

const errorResponse = z.object({
  error: z.object({ code: z.string(), message: z.string() }),
});
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}
export async function request<T>(
  path: string,
  schema: z.ZodType<T>,
  init?: RequestInit,
): Promise<T> {
  try {
    const response = await fetch(path, {
      headers: init?.body instanceof FormData ? undefined : { "content-type": "application/json" },
      ...init,
    });
    const json: unknown = await response.json();
    if (!response.ok) {
      const parsed = errorResponse.safeParse(json);
      if (!parsed.success) {
        throw new Error(`API 错误响应结构无效：HTTP ${response.status.toString()}`);
      }
      const error = new ApiError(
        response.status,
        parsed.data.error.code,
        parsed.data.error.message,
      );
      if (error.code === "AUTH_REQUIRED") {
        globalThis.dispatchEvent(new Event("omity:auth-required"));
      }
      throw error;
    }
    const parsed = schema.safeParse(json);
    if (!parsed.success) {
      throw new Error(`API 成功响应结构无效：HTTP ${response.status.toString()}`, {
        cause: parsed.error,
      });
    }
    return parsed.data;
  } catch (error) {
    if (!init?.signal?.aborted) {
      reportError(error, { path });
    }
    throw error;
  }
}
