import type { ServerResponse } from "node:http";

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export function sendError(res: ServerResponse, error: unknown) {
  const normalized = normalizeError(error);
  if (normalized.status === 500) console.error(error);
  res.writeHead(normalized.status, {
    "content-type": "application/json; charset=utf-8",
  });
  res.end(JSON.stringify({ error: normalized.message }));
}

export function normalizeError(error: unknown) {
  if (error instanceof HttpError) return error;
  const message = error instanceof Error ? error.message : String(error);
  if (
    message.startsWith("会话不存在：") ||
    message.startsWith("会话数据库不存在：") ||
    message.startsWith("Fork 消息不存在：")
  ) {
    return new HttpError(404, message);
  }
  if (
    message.startsWith("会话已存在：") ||
    message.startsWith("会话已有 Host 正在运行：") ||
    message.startsWith("队列认领冲突：")
  ) {
    return new HttpError(409, message);
  }
  return new HttpError(500, message);
}
