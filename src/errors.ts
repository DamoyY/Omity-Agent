export type DomainErrorCode =
  | "SESSION_NOT_FOUND"
  | "SESSION_CONFLICT"
  | "HOST_LEASE_CONFLICT"
  | "QUEUE_CLAIM_CONFLICT"
  | "TOOL_NOT_RUNNING"
  | "FORK_MESSAGE_NOT_FOUND"
  | "ATTACHMENT_INVALID"
  | "ATTACHMENT_TOO_LARGE";

export class DomainError extends Error {
  override readonly name = "DomainError";

  constructor(
    readonly code: DomainErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export function sessionNotFound(sessionId: string) {
  return new DomainError("SESSION_NOT_FOUND", `会话不存在：${sessionId}`);
}

export function sessionConflict(sessionId: string) {
  return new DomainError("SESSION_CONFLICT", `会话已存在：${sessionId}`);
}

export function toolNotRunning(callId: string) {
  return new DomainError("TOOL_NOT_RUNNING", `工具调用未在运行：${callId}`);
}
