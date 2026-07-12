import { setTimeout as sleep } from "node:timers/promises";
import { randomUUID } from "node:crypto";
import { DomainError } from "../errors";
import type { BunSqliteSaver } from "../checkpointer";
import type { AgentDatabase } from "../infrastructure/database/agentDatabase";
import type { Logger } from "../infrastructure/logging/logger";
import type { SessionStatus, Settings } from "../types";
import type { buildGraph } from "../agent";
import { BaseMessage } from "@langchain/core/messages";
import { z } from "zod";

type AgentGraph = ReturnType<typeof buildGraph>["graph"];
type HostGraph = Omit<AgentGraph, "getState"> & {
  getState: (...args: Parameters<AgentGraph["getState"]>) => Promise<unknown>;
};
export interface HostObserver {
  activity?(
    sessionId: string,
    status: Extract<SessionStatus, "tool" | "model" | "idle">,
  ): void;
  changed?(sessionId: string): void;
  transcript?(sessionId: string): void;
  token(sessionId: string, queueId: number, text: string): void;
}

export interface HostContext {
  settings: Settings;
  logger: Logger;
  db: AgentDatabase;
  graph: HostGraph;
  checkpointer: BunSqliteSaver;
  sessionId: string;
  controller: AbortController;
  wake?: (delayMs: number) => Promise<void>;
  observer?: HostObserver;
}

export function waitForWake(ctx: HostContext, delayMs: number) {
  if (!ctx.wake) return abortableSleep(delayMs, ctx.controller.signal);
  return ctx.wake(delayMs);
}

async function abortableSleep(delayMs: number, signal: AbortSignal) {
  try {
    await sleep(delayMs, undefined, { signal });
  } catch (error) {
    if (!signal.aborted) throw error;
  }
}

interface RuntimeGraphState extends Record<string, unknown> {
  values: Record<string, unknown> & {
    messages: BaseMessage[];
    hookPlan?: unknown;
    hookPendingUserIds?: string[];
  };
  next: string[];
  tasks: (Record<string, unknown> & { name: string })[];
}

const graphMessageSchema = z.custom<BaseMessage>((value) =>
  BaseMessage.isInstance(value),
);
const graphValuesSchema = z.looseObject({
  messages: z.preprocess(
    (value) => (Array.isArray(value) ? (value as unknown[]) : []),
    z.array(graphMessageSchema),
  ),
  hookPlan: z.unknown().optional(),
  hookPendingUserIds: z.array(z.string()).optional(),
});
const graphStateSchema = z.looseObject({
  values: z.preprocess(
    (value) =>
      typeof value === "object" && value !== null && !Array.isArray(value)
        ? value
        : {},
    graphValuesSchema,
  ),
  next: z.array(z.string()),
  tasks: z.array(
    z.looseObject({
      name: z.string(),
    }),
  ),
});

export function readGraphState(value: unknown): RuntimeGraphState {
  if (typeof value !== "object" || value === null) {
    throw new Error("LangGraph 状态无效");
  }
  const parsed = graphStateSchema.safeParse(value);
  if (!parsed.success) {
    const path = parsed.error.issues[0]?.path;
    if (path?.[0] === "values" && path[1] === "messages") {
      throw new Error("LangGraph 消息状态无效");
    }
    if (path?.[0] === "next") throw new Error("LangGraph next 状态无效");
    if (path?.[0] === "tasks") throw new Error("LangGraph task 状态无效");
    if (path?.[0] === "values" && path[1] === "hookPendingUserIds") {
      throw new Error("LangGraph Hook pending 状态无效");
    }
    throw new Error("LangGraph 消息状态无效");
  }
  return parsed.data;
}

export class HostLease {
  private readonly ownerId = randomUUID();
  private readonly timer: ReturnType<typeof setInterval>;
  private error?: Error;

  constructor(
    private readonly db: AgentDatabase,
    private readonly logger: Logger,
    private readonly sessionId: string,
    private readonly controller: AbortController,
    private readonly ttlMs: number,
  ) {
    if (
      !db.acquireHostLease({
        sessionId,
        ownerId: this.ownerId,
        now: Date.now(),
        ttlMs: this.ttlMs,
      })
    ) {
      throw new DomainError(
        "HOST_LEASE_CONFLICT",
        `会话已有 Host 正在运行：${sessionId}`,
      );
    }
    this.timer = setInterval(
      () => {
        this.renew();
      },
      Math.max(1, Math.floor(this.ttlMs / 3)),
    );
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
          ttlMs: this.ttlMs,
        })
      ) {
        throw new Error(`Host Lease 已丢失：${this.sessionId}`);
      }
    } catch (error) {
      this.error = error instanceof Error ? error : new Error(String(error));
      this.controller.abort(this.error);
      this.logger.error("Host Lease 续租失败", {
        sessionId: this.sessionId,
        error: this.error.message,
      });
    }
  }
}
