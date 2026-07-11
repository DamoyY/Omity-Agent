import { Database } from "bun:sqlite";
import {
  mapChatMessagesToStoredMessages,
  mapStoredMessagesToChatMessages,
  type StoredMessage,
  type ToolMessage,
} from "@langchain/core/messages";
import {
  applyHookCallSchema,
  registerHookCall,
  requireHookCall,
  type HookCallDetails,
} from "./storage/calls";

type InvocationRow = {
  status: string;
  output_json: string | null;
  error: string | null;
};

type StoredOutput = {
  output: unknown;
  structuredOutput?: unknown;
  message?: StoredMessage;
};

export class HookLedger {
  private readonly db: Database;

  constructor(path: string) {
    this.db = new Database(path, { create: true, strict: true });
    this.db.run("PRAGMA journal_mode = WAL");
    applyHookCallSchema(this.db);
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

  complete(key: string, output: ToolMessage) {
    const [message] = mapChatMessagesToStoredMessages([output]);
    if (!message) throw new Error("无法序列化工具结果");
    const structuredOutput = extractStructuredOutput(output.artifact);
    const stored: StoredOutput = {
      output: output.content,
      ...(structuredOutput === undefined ? {} : { structuredOutput }),
      message,
    };
    const outputJson = JSON.stringify(stored);
    if (outputJson === undefined) throw new Error("工具结果无法持久化");
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
    const stored = parseOutput(row.output_json);
    if (!stored?.message) return undefined;
    const [message] = mapStoredMessagesToChatMessages([stored.message]);
    return message as ToolMessage | undefined;
  }

  latestOutput(threadId: string) {
    const row = this.db
      .query<{ output_json: string }, [string]>(
        "SELECT output_json FROM invocations WHERE thread_id = ? AND status = 'done' AND output_json IS NOT NULL ORDER BY rowid DESC LIMIT 1",
      )
      .get(threadId);
    const stored = parseOutput(row?.output_json ?? null);
    if (!stored) return undefined;
    return {
      output: stored.output,
      ...(stored.structuredOutput === undefined
        ? {}
        : { structuredOutput: stored.structuredOutput }),
    };
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
    return this.db
      .query<InvocationRow, [string]>(
        "SELECT status, output_json, error FROM invocations WHERE invocation_key = ?",
      )
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

function parseOutput(value: string | null): StoredOutput | undefined {
  if (value === null) return undefined;
  const parsed = JSON.parse(value) as unknown;
  if (typeof parsed !== "object" || parsed === null || !("output" in parsed)) {
    throw new Error("Hook 工具结果记录无效");
  }
  return parsed as StoredOutput;
}

function extractStructuredOutput(value: unknown) {
  if (!Array.isArray(value)) return undefined;
  const artifacts = value.filter(
    (item) =>
      typeof item === "object" &&
      item !== null &&
      "type" in item &&
      item.type === "mcp_structured_content",
  );
  if (artifacts.length > 1) {
    throw new Error("MCP 工具返回了多个结构化输出 artifact");
  }
  const artifact = artifacts[0];
  if (!artifact) return undefined;
  if (!("data" in artifact)) {
    throw new Error("MCP 结构化输出 artifact 缺少 data");
  }
  return artifact.data;
}
