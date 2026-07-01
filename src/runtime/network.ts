const retryableNames = new Set([
  "APIConnectionError",
  "APIConnectionTimeoutError",
  "TimeoutError",
]);

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
]);

const retryableMessageParts = [
  "connection error",
  "fetch failed",
  "network",
  "socket",
  "terminated",
  "tls",
  "timeout",
];

export function isModelNetworkError(error: unknown): boolean {
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
  if (typeof error["message"] === "string") {
    const message = error["message"].toLowerCase();
    if (retryableMessageParts.some((part) => message.includes(part))) {
      return true;
    }
  }
  return isModelNetworkError(error["cause"]);
}

export function modelNetworkRetryDelayMs(attempt: number): number {
  const exponent = Math.min(Math.max(0, attempt - 1), 5);
  return Math.min(30_000, 1_000 * 2 ** exponent);
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
