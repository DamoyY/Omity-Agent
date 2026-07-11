import { Database } from "bun:sqlite";
import { randomUUID } from "node:crypto";
import type { ToolMessage } from "@langchain/core/messages";
import {
  applyHookCallSchema,
  registerHookCall,
  requireHookCall,
  type HookCallDetails,
} from "./storage/calls";
import {
  applyInvocationSchema,
  bindInvocation,
  canRunInvocation,
  insertInvocation,
  readInvocation,
  reclaimInvocation,
  type InvocationRow,
  type InvocationDetails,
} from "./storage/invocations";
import {
  readToolOutput,
  restoreToolOutput,
  serializeToolOutput,
} from "./storage/outputs";

export class HookLedger {
  private readonly db: Database;
  private readonly ownerId = randomUUID();
  private readonly leaseMs: number;
  private readonly now: () => number;

  constructor(
    path: string,
    options: { leaseMs?: number; now?: () => number } = {},
  ) {
    this.db = new Database(path, { create: true, strict: true });
    this.db.run("PRAGMA journal_mode = WAL");
    applyHookCallSchema(this.db);
    applyInvocationSchema(this.db);
    this.leaseMs = options.leaseMs ?? 30_000;
    this.now = options.now ?? Date.now;
  }

  close() {
    this.db.close();
  }

  canRun(
    sessionId: string,
    threadId: string,
    details: Omit<InvocationDetails, "key" | "sessionId" | "threadId">,
    runLimit: number,
  ) {
    return canRunInvocation(
      this.db,
      bindInvocation(sessionId, threadId, details),
      runLimit,
    );
  }

  claim(
    sessionId: string,
    threadId: string,
    source: Omit<InvocationDetails, "key" | "sessionId" | "threadId">,
    runLimit: number,
  ) {
    const details = bindInvocation(sessionId, threadId, source);
    const row = this.read(details.key);
    const now = this.now();
    if (
      row?.status === "running" &&
      reclaimInvocation(this.db, details.key, this.ownerId, now, this.leaseMs)
    ) {
      return { key: details.key, existing: null };
    }
    if (row) return { key: details.key, existing: row };
    if (
      insertInvocation(
        this.db,
        details,
        runLimit,
        this.ownerId,
        now,
        this.leaseMs,
      )
    )
      return { key: details.key, existing: null };
    const concurrent = this.read(details.key);
    if (concurrent) return { key: details.key, existing: concurrent };
    throw new Error(
      `Hook ${details.hookId} 已达到 session 运行上限 ${runLimit}`,
    );
  }

  complete(key: string, output: ToolMessage) {
    const outputJson = serializeToolOutput(output);
    const result = this.db.run(
      `UPDATE invocations SET status = 'done', output_json = ?, error = NULL,
       updated_at = unixepoch() WHERE invocation_key = ?
       AND status = 'running' AND owner_id = ?`,
      [outputJson, key, this.ownerId],
    );
    if (result.changes !== 1) throw new Error(`Hook Lease 已丢失：${key}`);
  }

  fail(key: string, error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    const result = this.db.run(
      `UPDATE invocations SET status = 'error', error = ?,
       updated_at = unixepoch() WHERE invocation_key = ?
       AND status = 'running' AND owner_id = ?`,
      [message, key, this.ownerId],
    );
    if (result.changes !== 1) throw new Error(`Hook Lease 已丢失：${key}`);
  }

  restoredOutput(row: InvocationRow) {
    return restoreToolOutput(row.output_json);
  }

  output(key: string) {
    const row = this.db
      .query<{ output_json: string }, [string]>(
        "SELECT output_json FROM invocations WHERE invocation_key = ? AND status = 'done' AND output_json IS NOT NULL",
      )
      .get(key);
    return readToolOutput(row?.output_json ?? null);
  }

  invocationKey(
    sessionId: string,
    threadId: string,
    details: Omit<InvocationDetails, "key" | "sessionId" | "threadId">,
  ) {
    return bindInvocation(sessionId, threadId, details).key;
  }

  registerCall(
    callId: string,
    sessionId: string,
    threadId: string,
    details: HookCallDetails,
  ) {
    registerHookCall(this.db, callId, sessionId, threadId, details);
  }

  requireCall(callId: string, sessionId: string, threadId: string) {
    return requireHookCall(this.db, callId, sessionId, threadId);
  }

  requireRunnable(row: InvocationRow, key: string) {
    if (row.status === "done") return;
    const detail = row.error ? `：${row.error}` : "";
    throw new Error(`Hook 调用状态不确定，拒绝重复执行 ${key}${detail}`);
  }

  rows() {
    return this.db
      .query<{ status: string; trigger: string }, []>(
        "SELECT status, trigger FROM invocations ORDER BY rowid",
      )
      .all();
  }

  private read(key: string) {
    return readInvocation(this.db, key);
  }
}

export type { InvocationRow } from "./storage/invocations";
