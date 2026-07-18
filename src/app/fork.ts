import type { AgentDatabase } from "../infrastructure/database/agentDatabase";
import type { Database } from "bun:sqlite";
import { DomainError } from "../errors";
import { contentToText } from "../runtime/content";
import { copyHookUsage } from "../hooks/storage/usage";
import { messageRowsToChatMessages } from "../infrastructure/database/records/messages/serialization";
import { randomUUID } from "node:crypto";
import { runTransaction } from "../infrastructure/database/connection";
import { storeMessage } from "../infrastructure/database/records/messages/history";

interface MessageRow {
  id: number;
  source_id: string;
  message_json: string;
  position: number;
  created_at: number;
}
interface ForkOptions {
  source: AgentDatabase;
  target: AgentDatabase;
  sourceSessionId: string;
  targetSessionId: string;
  workspace: string;
  beforeMessageId: number;
}
export function forkDatabaseBeforeMessage(options: ForkOptions) {
  const forkPoint = assertForkPoint(
    options.source.db,
    options.sourceSessionId,
    options.beforeMessageId,
  );
  const messages = forkMessages(options.source.db, options.sourceSessionId, forkPoint.position);
  if (!messages.some((message) => storedMessageType(message.message_json) === "human")) {
    throw new Error("每个 session 的第一条用户消息不能 Fork");
  }
  runTransaction(options.target.db, () => {
    options.target.createSession(options.targetSessionId, options.workspace);
    insertMessages(options.target.db, options.targetSessionId, messages);
    copyHookUsage(
      options.source.db,
      options.sourceSessionId,
      options.target.db,
      options.targetSessionId,
    );
    const content = messageContent(forkPoint.message_json);
    options.target.appendDraft(options.targetSessionId, content);
  });
}
function assertForkPoint(db: Database, sessionId: string, messageId: number) {
  if (!Number.isSafeInteger(messageId) || messageId <= 0) {
    throw new Error(`Fork 消息 ID 无效：${messageId.toString()}`);
  }
  const query = db.prepare<MessageRow, [string, number]>(
    `SELECT m.id, m.source_id, m.message_json, m.position, m.created_at
     FROM messages m
     WHERE m.session_id = ? AND m.id = ? AND m.position IS NOT NULL`,
  );
  let row: MessageRow | null;
  try {
    row = query.get(sessionId, messageId);
  } finally {
    query.finalize();
  }
  if (!row) {
    throw new DomainError("FORK_MESSAGE_NOT_FOUND", `Fork 消息不存在：${messageId.toString()}`);
  }
  if (storedMessageType(row.message_json) !== "human") {
    throw new Error("只能从用户消息创建 Fork");
  }
  return row;
}
function forkMessages(db: Database, sessionId: string, beforePosition: number) {
  const query = db.prepare<MessageRow, [string, number]>(
    `SELECT m.id, m.source_id, m.message_json, m.position, m.created_at
     FROM messages m
     WHERE m.session_id = ? AND m.position < ? ORDER BY m.position`,
  );
  try {
    return query.all(sessionId, beforePosition);
  } finally {
    query.finalize();
  }
}
function insertMessages(db: Database, sessionId: string, messages: MessageRow[]) {
  for (const [position, message] of messages.entries()) {
    const [chatMessage] = messageRowsToChatMessages([message]);
    if (!chatMessage) {
      throw new Error("无法还原 Fork 消息");
    }
    chatMessage.id = randomUUID();
    storeMessage(db, sessionId, chatMessage, position, undefined, message.created_at);
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
  if (!message) {
    throw new Error("无法还原 Fork 消息");
  }
  return contentToText(message.content);
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
