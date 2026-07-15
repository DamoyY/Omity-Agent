import { DomainError, type DomainErrorCode } from "../../errors";
import type { ContentfulStatusCode } from "hono/utils/http-status";

export type ApiErrorCode =
  | DomainErrorCode
  | "AUTH_INVALID"
  | "AUTH_NOT_CONFIGURED"
  | "AUTH_REQUIRED"
  | "BAD_REQUEST"
  | "LOCAL_ONLY"
  | "NOT_FOUND"
  | "PAYLOAD_TOO_LARGE"
  | "RATE_LIMITED"
  | "INTERNAL_ERROR";
const domainStatuses: Record<DomainErrorCode, ContentfulStatusCode> = {
  ATTACHMENT_INVALID: 400,
  ATTACHMENT_TOO_LARGE: 413,
  FORK_MESSAGE_NOT_FOUND: 404,
  HOST_LEASE_CONFLICT: 409,
  QUEUE_CLAIM_CONFLICT: 409,
  SESSION_CONFLICT: 409,
  SESSION_NOT_FOUND: 404,
  TOOL_NOT_RUNNING: 409,
};
export class HttpError extends Error {
  readonly code: ApiErrorCode;
  constructor(
    readonly status: ContentfulStatusCode,
    message: string,
    code?: ApiErrorCode,
  ) {
    super(message);
    this.name = "HttpError";
    this.code = code ?? httpCode(status);
  }
}
export function errorResponse(error: unknown) {
  const normalized = normalizeError(error);
  if (normalized.status === 500) {
    console.error(error);
  }
  return {
    body: {
      error: { code: normalized.code, message: normalized.message },
    },
    status: normalized.status,
  };
}
export function normalizeError(error: unknown) {
  if (error instanceof HttpError) {
    return error;
  }
  if (error instanceof DomainError) {
    return new HttpError(domainStatuses[error.code], error.message, error.code);
  }
  return new HttpError(500, errorMessage(error), "INTERNAL_ERROR");
}
function errorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message || error.name;
  }
  return String(error);
}
function httpCode(status: ContentfulStatusCode): ApiErrorCode {
  if (status === 400) {
    return "BAD_REQUEST";
  }
  if (status === 404) {
    return "NOT_FOUND";
  }
  if (status === 413) {
    return "PAYLOAD_TOO_LARGE";
  }
  return "INTERNAL_ERROR";
}
