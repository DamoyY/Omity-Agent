import { Database } from "bun:sqlite";
import { randomUUID } from "node:crypto";
import { ToolMessage } from "@langchain/core/messages";
import {
  loadMessage,
  storeMessage,
} from "../infrastructure/database/records/messages/history";
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
import { readToolOutput } from "./storage/outputs";
import { maintainInvocationLease } from "./lease";

export class HookLedger {
  private readonly ownerId = randomUUID();
  private readonly leaseMs: number;
  private readonly now: () => number;

  constructor(
    private readonly db: Database,
    options: { leaseMs: number; now?: () => number },
  ) {
    applyInvocationSchema(this.db);
    this.leaseMs = options.leaseMs;
    this.now = options.now ?? Date.now;
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
    if (row) {
      if (
        row.status === "running" &&
        reclaimInvocation(this.db, details.key, this.ownerId, now, this.leaseMs)
      ) {
        return { kind: "execute", key: details.key } as const;
      }
      const latest = this.read(details.key);
      if (!latest) throw new Error(`Hook 调用记录被并发删除：${details.key}`);
      return { kind: "restore", key: details.key, row: latest } as const;
    }
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
    this.db
      .transaction(() => {
        const outputMessageId = storeMessage(
          this.db,
          this.sessionId(key),
          output,
        );
        const result = this.db.run(
          `UPDATE invocations
           SET output_message_id = ?, error = NULL,
               owner_id = NULL, lease_expires_at = NULL
           WHERE invocation_key = ? AND output_message_id IS NULL
             AND error IS NULL AND owner_id = ?`,
          [outputMessageId, key, this.ownerId],
        );
        if (result.changes !== 1) {
          throw new Error(`Hook Lease 已丢失：${key}`);
        }
      })
      .immediate();
  }

  fail(key: string, error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    const result = this.db.run(
      `UPDATE invocations
       SET error = ?, owner_id = NULL, lease_expires_at = NULL
       WHERE invocation_key = ? AND output_message_id IS NULL
         AND error IS NULL AND owner_id = ?`,
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
    if (row.output_message_id === null) return undefined;
    const message = loadMessage(this.db, row.output_message_id);
    return ToolMessage.isInstance(message) ? message : undefined;
  }

  output(key: string) {
    const row = this.db
      .query<{ output_message_id: number }, [string]>(
        `SELECT output_message_id FROM invocations
         WHERE invocation_key = ? AND output_message_id IS NOT NULL`,
      )
      .get(key);
    if (!row) return undefined;
    const message = loadMessage(this.db, row.output_message_id);
    return ToolMessage.isInstance(message)
      ? readToolOutput(message)
      : undefined;
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

  private read(key: string) {
    return readInvocation(this.db, key);
  }

  private sessionId(key: string) {
    const row = this.db
      .query<{ session_id: string }, [string]>(
        "SELECT session_id FROM invocations WHERE invocation_key = ?",
      )
      .get(key);
    if (!row) throw new Error(`Hook 调用记录缺失：${key}`);
    return row.session_id;
  }
}

export type { InvocationRow } from "./storage/invocations";
