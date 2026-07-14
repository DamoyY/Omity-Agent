import isNetworkError from "is-network-error";

const retryableNames = new Set([
  "APIConnectionError",
  "APIConnectionTimeoutError",
  "ModelEmptyResponseError",
  "TimeoutError",
]);
export class ModelEmptyResponseError extends Error {
  override readonly name = "ModelEmptyResponseError";
  constructor() {
    super("模型 API 没有返回文本或工具调用");
  }
}
const retryableCodes = new Set([
  "ECONNABORTED",
  "ECONNREFUSED",
  "ECONNRESET",
  "EHOSTUNREACH",
  "ENETDOWN",
  "ENETRESET",
  "ENETUNREACH",
  "ENOTFOUND",
  "ETIMEDOUT",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_HEADERS_TIMEOUT",
  "UND_ERR_SOCKET",
  "stream_read_error",
]);
export function isModelNetworkError(error: unknown): boolean {
  if (isNetworkError(error)) {
    return true;
  }
  if (!isRecord(error)) {
    return false;
  }
  if (typeof error["name"] === "string") {
    if (error["name"] === "AbortError") {
      return false;
    }
    if (retryableNames.has(error["name"])) {
      return true;
    }
  }
  if (typeof error["code"] === "string" && retryableCodes.has(error["code"])) {
    return true;
  }
  return isModelNetworkError(error["cause"]);
}
export function modelNetworkRetryDelayMs(attempt: number): number {
  const exponent = Math.min(Math.max(0, attempt - 1), 5);
  return Math.min(30_000, 1000 * 2 ** exponent);
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
