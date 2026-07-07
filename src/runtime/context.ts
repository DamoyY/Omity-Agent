import { setTimeout as sleep } from "node:timers/promises";
import type { BunSqliteSaver } from "../checkpointer";
import type { AgentDatabase } from "../infrastructure/database";
import type { Logger } from "../infrastructure/logger";
import type { Settings } from "../types";

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
  sessionId: string;
  signal: StopSignal;
  wake?: (delayMs: number) => Promise<void>;
  observer?: HostObserver;
};

export function waitForWake(ctx: HostContext, delayMs: number) {
  if (!ctx.wake) return sleep(delayMs);
  return ctx.wake(delayMs);
}
