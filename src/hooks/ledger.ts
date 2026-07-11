import { Database } from "bun:sqlite";
import { randomUUID } from "node:crypto";
import type { ToolMessage } from "@langchain/core/messages";
import {
  applyInvocationSchema,
  bindInvocation,
  insertInvocation,
  readInvocation,
  reclaimInvocation,
  renewInvocation,
  type InvocationRow,
  type InvocationDetails,
} from "./storage/invocations";
import {
  readToolOutput,
  restoreToolOutput,
  serializeToolOutput,
} from "./storage/outputs";
import { maintainInvocationLease } from "./lease";

export class HookLedger {
  private readonly db: Database;
  private readonly ownerId = randomUUID();
  private readonly leaseMs: number;
  private readonly now: () => number;

  constructor(path: string, options: { leaseMs: number; now?: () => number }) {
    this.db = new Database(path, { create: true, strict: true });
    this.db.run("PRAGMA journal_mode = WAL");
    applyInvocationSchema(this.db);
    this.leaseMs = options.leaseMs;
    this.now = options.now ?? Date.now;
  }

  close() {
    this.db.close();
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
      return { kind: "execute", key: details.key } as const;
    }
    if (row) return { kind: "restore", key: details.key, row } as const;
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
      return { kind: "execute", key: details.key } as const;
    const concurrent = this.read(details.key);
    if (concurrent)
      return {
        kind: "restore",
        key: details.key,
        row: concurrent,
      } as const;
    return { kind: "skip" } as const;
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

  withLease<T>(key: string, operation: () => Promise<T>) {
    return maintainInvocationLease(
      this.leaseMs,
      () => {
        if (
          !renewInvocation(this.db, key, this.ownerId, this.now(), this.leaseMs)
        ) {
          throw new Error(`Hook Lease 已丢失：${key}`);
        }
      },
      operation,
    );
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
