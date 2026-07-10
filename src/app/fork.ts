import type { Database } from "bun:sqlite";
import { AgentDatabase } from "../infrastructure/database";
import { messageRowsToChatMessages } from "../infrastructure/messages";
import { contentToText } from "../runtime/content";

type MessageRow = {
  id: number;
  message_json: string;
  created_at: number;
};

type ForkOptions = {
  source: AgentDatabase;
  target: AgentDatabase;
  sourceSessionId: string;
  targetSessionId: string;
  workspace: string;
  beforeMessageId: number;
};

type ForkKind = "draft" | "pause";

export function forkDatabaseBeforeMessage(options: ForkOptions) {
  const forkPoint = assertForkPoint(
    options.source.db,
    options.sourceSessionId,
    options.beforeMessageId,
  );
  const messages = forkMessages(
    options.source.db,
    options.sourceSessionId,
    options.beforeMessageId,
  );
  if (
    !messages.some(
      (message) => storedMessageType(message.message_json) === "human",
    )
  ) {
    throw new Error("每个 session 的第一条用户消息不能 Fork");
  }
  const tx = options.target.db.transaction(() => {
    options.target.createSession(options.targetSessionId, options.workspace);
    insertMessages(options.target.db, options.targetSessionId, messages);
    const content = messageContent(forkPoint.message_json);
    if (forkKind(options.source.db, forkPoint.id) === "pause") {
      options.target.appendForkPause(options.targetSessionId, content);
    } else {
      options.target.appendDraft(options.targetSessionId, content);
    }
  });
  tx();
}

function assertForkPoint(db: Database, sessionId: string, messageId: number) {
  if (!Number.isSafeInteger(messageId) || messageId <= 0) {
    throw new Error(`Fork 消息 ID 无效：${messageId}`);
  }
  const row = db
    .query<
      MessageRow,
      [string, number]
    >("SELECT id, message_json, created_at FROM messages WHERE session_id = ? AND id = ?")
    .get(sessionId, messageId);
  if (!row) throw new Error(`Fork 消息不存在：${messageId}`);
  if (storedMessageType(row.message_json) !== "human") {
    throw new Error("只能从用户消息创建 Fork");
  }
  return row;
}

function forkMessages(
  db: Database,
  sessionId: string,
  beforeMessageId: number,
) {
  return db
    .query<
      MessageRow,
      [string, number]
    >("SELECT id, message_json, created_at FROM messages WHERE session_id = ? AND id < ? ORDER BY id")
    .all(sessionId, beforeMessageId);
}

function insertMessages(
  db: Database,
  sessionId: string,
  messages: MessageRow[],
) {
  const insert = db.query(
    "INSERT INTO messages (session_id, message_json, queue_id, created_at) VALUES (?, ?, NULL, ?)",
  );
  for (const message of messages) {
    insert.run(sessionId, message.message_json, message.created_at);
  }
}

function storedMessageType(value: string) {
  const parsed = JSON.parse(value) as unknown;
  if (!isRecord(parsed) || typeof parsed["type"] !== "string") {
    throw new Error("消息记录无效");
  }
  return parsed["type"];
}

function messageContent(value: string) {
  const [message] = messageRowsToChatMessages([{ message_json: value }]);
  if (!message) throw new Error("无法还原 Fork 消息");
  return contentToText(message.content);
}

function forkKind(db: Database, messageId: number): ForkKind {
  const row = db
    .query<{ root_queue_id: number | null; queue_id: number | null }, [number]>(
      `SELECT r.root_queue_id, m.queue_id FROM messages m
       LEFT JOIN queue q ON q.id = m.queue_id
       LEFT JOIN runs r ON r.id = q.run_id
       WHERE m.id = ?`,
    )
    .get(messageId);
  if (!row?.queue_id) return "draft";
  return row.root_queue_id === row.queue_id ? "draft" : "pause";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
