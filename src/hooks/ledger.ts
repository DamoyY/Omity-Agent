import { Database } from "bun:sqlite";
import {
  mapChatMessagesToStoredMessages,
  mapStoredMessagesToChatMessages,
  type ToolMessage,
} from "@langchain/core/messages";

type InvocationRow = {
  status: string;
  output_json: string | null;
  error: string | null;
};

export class HookLedger {
  private readonly db: Database;

  constructor(path: string) {
    this.db = new Database(path, { create: true, strict: true });
    this.db.run("PRAGMA journal_mode = WAL");
    this.db.run(`
      CREATE TABLE IF NOT EXISTS invocations (
        invocation_key TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        thread_id TEXT NOT NULL,
        hook_id TEXT NOT NULL,
        trigger TEXT NOT NULL,
        source_id TEXT NOT NULL,
        status TEXT NOT NULL,
        output_json TEXT,
        error TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `);
  }

  close() {
    this.db.close();
  }

  claim(details: InvocationDetails) {
    const row = this.read(details.key);
    if (row) return row;
    this.db
      .query(
        `INSERT INTO invocations
         (invocation_key, session_id, thread_id, hook_id, trigger, source_id, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 'running', unixepoch(), unixepoch())`,
      )
      .run(
        details.key,
        details.sessionId,
        details.threadId,
        details.hookId,
        details.trigger,
        details.sourceId,
      );
    return null;
  }

  complete(key: string, output?: ToolMessage) {
    const outputJson = output ? JSON.stringify(storedMessage(output)) : null;
    this.db
      .query(
        "UPDATE invocations SET status = 'done', output_json = ?, error = NULL, updated_at = unixepoch() WHERE invocation_key = ?",
      )
      .run(outputJson, key);
  }

  fail(key: string, error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    this.db
      .query(
        "UPDATE invocations SET status = 'error', error = ?, updated_at = unixepoch() WHERE invocation_key = ?",
      )
      .run(message, key);
  }

  restoredOutput(row: InvocationRow) {
    if (!row.output_json) return undefined;
    const [message] = mapStoredMessagesToChatMessages([
      JSON.parse(row.output_json),
    ]);
    return message as ToolMessage | undefined;
  }

  requireRunnable(row: InvocationRow, key: string) {
    if (row.status === "done") return;
    const detail = row.error ? `：${row.error}` : "";
    throw new Error(`Hook 调用状态不确定，拒绝重复执行 ${key}${detail}`);
  }

  rows() {
    return this.db
      .query<
        { status: string; trigger: string },
        []
      >("SELECT status, trigger FROM invocations ORDER BY created_at")
      .all();
  }

  private read(key: string) {
    return this.db
      .query<
        InvocationRow,
        [string]
      >("SELECT status, output_json, error FROM invocations WHERE invocation_key = ?")
      .get(key);
  }
}

export type InvocationDetails = {
  key: string;
  sessionId: string;
  threadId: string;
  hookId: string;
  trigger: string;
  sourceId: string;
};

function storedMessage(message: ToolMessage) {
  const [stored] = mapChatMessagesToStoredMessages([message]);
  if (!stored) throw new Error("无法序列化 Hook 工具结果");
  return stored;
}
