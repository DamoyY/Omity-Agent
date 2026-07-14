import { DomainError } from "../../errors";
import type { AgentDatabase } from "../../infrastructure/database/agentDatabase";
import type { Logger } from "../../infrastructure/logging/logger";
import {
  hostOwnerId,
  standaloneOwner,
  type ProcessOwner,
} from "../../infrastructure/process/ownership";

export class HostLeaseLostError extends Error {}

export class HostLease {
  private readonly ownerId: string;
  private readonly timer: ReturnType<typeof setInterval>;
  private error?: Error;

  constructor(
    private readonly db: AgentDatabase,
    private readonly logger: Logger,
    private readonly sessionId: string,
    private readonly controller: AbortController,
    private readonly ttlMs: number,
    owner: ProcessOwner = standaloneOwner(),
  ) {
    this.ownerId = hostOwnerId(owner);
    if (
      !db.acquireHostLease({
        sessionId,
        ownerId: this.ownerId,
        now: Date.now(),
        ttlMs,
      })
    ) {
      throw new DomainError("HOST_LEASE_CONFLICT", `会话已有 Host 正在运行：${sessionId}`);
    }
    this.timer = setInterval(
      () => {
        this.renew();
      },
      Math.max(1, Math.floor(ttlMs / 3)),
    );
    this.timer.unref();
  }

  assertOwned() {
    if (this.error) throw this.error;
    if (this.db.hostLease(this.sessionId)?.ownerId !== this.ownerId) {
      const error = new HostLeaseLostError(`Host Lease 已丢失：${this.sessionId}`);
      this.fail(error);
      throw error;
    }
  }

  close() {
    clearInterval(this.timer);
    this.db.releaseHostLease(this.sessionId, this.ownerId);
  }

  private renew() {
    try {
      const renewed = this.db.renewHostLease({
        sessionId: this.sessionId,
        ownerId: this.ownerId,
        now: Date.now(),
        ttlMs: this.ttlMs,
      });
      if (!renewed) {
        throw new HostLeaseLostError(`Host Lease 已丢失：${this.sessionId}`);
      }
    } catch (error) {
      this.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }

  private fail(error: Error) {
    this.error = error;
    this.controller.abort(error);
    this.logger.error("Host Lease 续租失败", {
      sessionId: this.sessionId,
      error: error.message,
    });
  }
}
