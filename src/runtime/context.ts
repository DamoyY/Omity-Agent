import { setTimeout as sleep } from "node:timers/promises";
import type { BunSqliteSaver } from "../checkpointer";
import type { AgentDatabase } from "../infrastructure/database/agentDatabase";
import type { StreamEvent } from "../infrastructure/database/records/streamEvents";
import type { Logger } from "../infrastructure/logging/logger";
import type { SessionStatus, Settings } from "../types";
import type { buildGraph } from "../agent";
import { BaseMessage } from "@langchain/core/messages";
import { z } from "zod";
import type { ToolExecutions } from "../agent/toolExecutions";
type AgentGraph = ReturnType<typeof buildGraph>["graph"];
type HostGraph = Omit<AgentGraph, "getState"> & {
  getState: (...args: Parameters<AgentGraph["getState"]>) => Promise<unknown>;
};
export interface HostObserver {
  activity?(sessionId: string, status: Extract<SessionStatus, "tool" | "model" | "idle">): void;
  changed?(sessionId: string): void;
  transcript?(sessionId: string, event: StreamEvent): void;
  token(sessionId: string, queueId: number, text: string): void;
}
export interface HostContext {
  settings: Settings;
  logger: Logger;
  db: AgentDatabase;
  graph: HostGraph;
  checkpointer: BunSqliteSaver;
  toolExecutions?: ToolExecutions;
  sessionId: string;
  controller: AbortController;
  stopping?: AbortSignal;
  assertLease?: () => void;
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
const graphMessageSchema = z.custom<BaseMessage>((value) => BaseMessage.isInstance(value));
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
    (value) => (typeof value === "object" && value !== null && !Array.isArray(value) ? value : {}),
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
