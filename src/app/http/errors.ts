import { DomainError, type DomainErrorCode } from "../../errors";

export type ApiErrorCode =
  | DomainErrorCode
  | "BAD_REQUEST"
  | "NOT_FOUND"
  | "PAYLOAD_TOO_LARGE"
  | "INTERNAL_ERROR";

const domainStatuses: Record<DomainErrorCode, number> = {
  SESSION_NOT_FOUND: 404,
  SESSION_CONFLICT: 409,
  HOST_LEASE_CONFLICT: 409,
  QUEUE_CLAIM_CONFLICT: 409,
  FORK_MESSAGE_NOT_FOUND: 404,
  ATTACHMENT_INVALID: 400,
  ATTACHMENT_TOO_LARGE: 413,
};

export class HttpError extends Error {
  readonly code: ApiErrorCode;

  constructor(
    readonly status: number,
    message: string,
    code?: ApiErrorCode,
  ) {
    super(message);
    this.code = code ?? httpCode(status);
  }
}

export function errorResponse(error: unknown) {
  const normalized = normalizeError(error);
  if (normalized.status === 500) console.error(error);
  return {
    status: normalized.status,
    body: {
      error: { code: normalized.code, message: normalized.message },
    },
  };
}

export function normalizeError(error: unknown) {
  if (error instanceof HttpError) return error;
  if (error instanceof DomainError) {
    return new HttpError(domainStatuses[error.code], error.message, error.code);
  }
  return new HttpError(500, errorMessage(error), "INTERNAL_ERROR");
}

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message || error.name;
  return String(error);
}

function httpCode(status: number): ApiErrorCode {
  if (status === 400) return "BAD_REQUEST";
  if (status === 404) return "NOT_FOUND";
  if (status === 413) return "PAYLOAD_TOO_LARGE";
  return "INTERNAL_ERROR";
}
