import { setTimeout as sleep } from "node:timers/promises";
import { randomUUID } from "node:crypto";
import type { BunSqliteSaver } from "../checkpointer";
import type { AgentDatabase } from "../infrastructure/database";
import type { Logger } from "../infrastructure/logger";
import type { Settings } from "../types";
import type { HookRuntime } from "../hooks/runtime";

export type StopSignal = {
  stopping: boolean;
};

export type HostObserver = {
  changed?(sessionId: string): void;
  token(sessionId: string, queueId: number, text: string): void;
};

export type HostContext = {
  settings: Settings;
  logger: Logger;
  db: AgentDatabase;
  graph: any;
  checkpointer: BunSqliteSaver;
  hooks: HookRuntime;
  beforeModelNode: string;
  sessionId: string;
  signal: StopSignal;
  wake?: (delayMs: number) => Promise<void>;
  observer?: HostObserver;
};

export function waitForWake(ctx: HostContext, delayMs: number) {
  if (!ctx.wake) return sleep(delayMs);
  return ctx.wake(delayMs);
}

const leaseTtlMs = 30_000;
const leaseRenewMs = 10_000;

export class HostLease {
  private readonly ownerId = randomUUID();
  private readonly timer: ReturnType<typeof setInterval>;
  private error?: Error;

  constructor(
    private readonly db: AgentDatabase,
    private readonly logger: Logger,
    private readonly sessionId: string,
    private readonly signal: StopSignal,
  ) {
    if (
      !db.acquireHostLease({
        sessionId,
        ownerId: this.ownerId,
        now: Date.now(),
        ttlMs: leaseTtlMs,
      })
    ) {
      throw new Error(`会话已有 Host 正在运行：${sessionId}`);
    }
    this.timer = setInterval(() => this.renew(), leaseRenewMs);
    this.timer.unref();
  }

  assertOwned() {
    if (this.error) throw this.error;
  }

  close() {
    clearInterval(this.timer);
    this.db.releaseHostLease(this.sessionId, this.ownerId);
  }

  private renew() {
    try {
      if (
        !this.db.renewHostLease({
          sessionId: this.sessionId,
          ownerId: this.ownerId,
          now: Date.now(),
          ttlMs: leaseTtlMs,
        })
      ) {
        throw new Error(`Host Lease 已丢失：${this.sessionId}`);
      }
    } catch (error) {
      this.error = error instanceof Error ? error : new Error(String(error));
      this.signal.stopping = true;
      this.logger.error("Host Lease 续租失败", {
        sessionId: this.sessionId,
        error: this.error.message,
      });
    }
  }
}
