import { reportError } from "./errors";
import { z } from "zod";
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
  }
}
export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  try {
    const response = await fetch(path, {
      headers: init?.body instanceof FormData ? undefined : { "content-type": "application/json" },
      ...init,
    });
    const json = (await response.json()) as unknown;
    if (!response.ok) {
      const parsed = errorResponse.safeParse(json);
      if (!parsed.success) {
        throw new Error(`API 错误响应结构无效：HTTP ${response.status.toString()}`);
      }
      throw new ApiError(response.status, parsed.data.error.code, parsed.data.error.message);
    }
    return json as T;
  } catch (error) {
    if (!init?.signal?.aborted) {
      reportError(error, { path });
    }
    throw error;
  }
}
