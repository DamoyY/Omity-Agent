import { createHash } from "node:crypto";
import type { Database } from "bun:sqlite";
import type { HookRule, HookTrigger, HookWhen } from "../../types";

export type HookCallDetails = {
  trigger: HookTrigger;
  sourceId: string;
  hookId: string;
};

type HookCallRow = HookCallDetails & {
  sessionId: string;
  threadId: string;
};

const hookCallPrefix = "omity-hook:";
const hookCallPattern = /^omity-hook:[A-Za-z0-9_-]{43}$/;

export function hookTrigger(target: string, when: HookWhen): HookTrigger {
  return `${target}:${when}`;
}

export function hookCallDetails(
  rule: HookRule,
  sourceId: string,
): HookCallDetails {
  return {
    trigger: hookTrigger(rule.target, rule.when),
    sourceId,
    hookId: rule.id,
  };
}

export function applyHookCallSchema(db: Database) {
  db.run(`
    CREATE TABLE IF NOT EXISTS hook_calls (
      call_id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      thread_id TEXT NOT NULL,
      trigger TEXT NOT NULL,
      source_id TEXT NOT NULL,
      hook_id TEXT NOT NULL
    )
  `);
}

export function createHookCallId(
  sessionId: string,
  threadId: string,
  details: HookCallDetails,
) {
  const identity = JSON.stringify([
    sessionId,
    threadId,
    details.trigger,
    details.sourceId,
    details.hookId,
  ]);
  const digest = createHash("sha256").update(identity).digest("base64url");
  return `${hookCallPrefix}${digest}`;
}

export function isHookCallId(id: string | undefined): id is string {
  return id !== undefined && hookCallPattern.test(id);
}

export function registerHookCall(
  db: Database,
  callId: string,
  sessionId: string,
  threadId: string,
  details: HookCallDetails,
) {
  if (!isHookCallId(callId)) throw new Error(`无效 Hook 调用 ID：${callId}`);
  db.query(
    `INSERT OR IGNORE INTO hook_calls
     (call_id, session_id, thread_id, trigger, source_id, hook_id)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(
    callId,
    sessionId,
    threadId,
    details.trigger,
    details.sourceId,
    details.hookId,
  );
  const stored = requireHookCall(db, callId, sessionId, threadId);
  if (!sameDetails(stored, details)) {
    throw new Error(`Hook 调用 ID 哈希冲突：${callId}`);
  }
}

export function requireHookCall(
  db: Database,
  callId: string,
  sessionId: string,
  threadId: string,
) {
  if (!isHookCallId(callId)) throw new Error(`无效 Hook 调用 ID：${callId}`);
  const row = db
    .query<
      {
        session_id: string;
        thread_id: string;
        trigger: HookCallDetails["trigger"];
        source_id: string;
        hook_id: string;
      },
      [string]
    >(
      "SELECT session_id, thread_id, trigger, source_id, hook_id FROM hook_calls WHERE call_id = ?",
    )
    .get(callId);
  if (!row) throw new Error(`Hook 调用元数据不存在：${callId}`);
  if (row.session_id !== sessionId || row.thread_id !== threadId) {
    throw new Error(`Hook 调用不属于当前会话线程：${callId}`);
  }
  return {
    sessionId: row.session_id,
    threadId: row.thread_id,
    trigger: row.trigger,
    sourceId: row.source_id,
    hookId: row.hook_id,
  } satisfies HookCallRow;
}

function sameDetails(left: HookCallDetails, right: HookCallDetails) {
  return (
    left.trigger === right.trigger &&
    left.sourceId === right.sourceId &&
    left.hookId === right.hookId
  );
}
