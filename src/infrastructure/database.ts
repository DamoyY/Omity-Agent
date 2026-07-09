import { Database } from "bun:sqlite";
import type { BaseMessage } from "@langchain/core/messages";
import type { Control, QueueItem, QueueStatus } from "../types";
import {
  appendAssistantMessage,
  insertUserMessage,
  loadMessages,
  replaceMessages,
} from "./messages";
import { toQueueItem, type QueueRow } from "./queueRows";
import { applySchema } from "./schema";
import {
  createSessionRecord,
  ensureSessionRecord,
  hasSessionRecord,
  readControlRecord,
  requireSessionRecord,
  touchSessionRecord,
  writeControlRecord,
} from "./sessionRecords";

export type StreamToolCallDelta = Partial<
  Record<"args" | "id" | "name", string> & { index: number }
>;

export class AgentDatabase {
  readonly db: Database;
  private notify?: () => void;

  constructor(path: string) {
    this.db = new Database(path, { create: true, strict: true });
    this.db.run("PRAGMA journal_mode = WAL");
    this.db.run("PRAGMA foreign_keys = ON");
    applySchema(this.db);
  }

  close() {
    this.db.close();
  }

  onChange(notify: () => void) {
    this.notify = notify;
  }

  resetSession(sessionId: string, workspace: string) {
    const tx = this.db.transaction(() => {
      this.db.query("DELETE FROM queue WHERE session_id = ?").run(sessionId);
      this.db.query("DELETE FROM messages WHERE session_id = ?").run(sessionId);
      this.db.query("DELETE FROM events WHERE session_id = ?").run(sessionId);
      this.db.query("DELETE FROM sessions WHERE id = ?").run(sessionId);
      this.createSession(sessionId, workspace);
    });
    tx();
  }

  createSession(sessionId: string, workspace: string) {
    createSessionRecord(this.db, sessionId, workspace);
  }

  ensureSession(sessionId: string, workspace: string) {
    ensureSessionRecord(this.db, sessionId, workspace);
  }

  hasSession(sessionId: string) {
    return hasSessionRecord(this.db, sessionId);
  }

  appendUser(sessionId: string, content: string) {
    this.requireSession(sessionId);
    const result = this.db
      .query(
        "INSERT INTO queue (session_id, content, status, created_at) VALUES (?, ?, 'pending', unixepoch())",
      )
      .run(sessionId, content);
    touchSessionRecord(this.db, sessionId);
    this.event(sessionId, "info", "client", "append", {
      queueId: Number(result.lastInsertRowid),
    });
    return Number(result.lastInsertRowid);
  }

  pendingAppends(sessionId: string): QueueItem[] {
    return this.db
      .query<QueueRow, [string]>(
        "SELECT id, content, status, user_message_id FROM queue WHERE session_id = ? AND status = 'pending' ORDER BY id",
      )
      .all(sessionId)
      .map(toQueueItem);
  }

  nextQueue(sessionId: string): QueueItem | null {
    const row = this.db
      .query<QueueRow, [string]>(
        "SELECT id, content, status, user_message_id FROM queue WHERE session_id = ? AND status IN ('pending', 'running', 'paused') ORDER BY id LIMIT 1",
      )
      .get(sessionId);
    return row ? toQueueItem(row) : null;
  }

  startQueue(sessionId: string, item: QueueItem) {
    if (item.userMessageId !== null) {
      this.setQueueStatus(item.id, "running");
      return item.userMessageId;
    }
    const tx = this.db.transaction(() => {
      const messageId = insertUserMessage(
        this.db,
        sessionId,
        item.content,
        item.id,
      );
      this.db
        .query(
          "UPDATE queue SET status = 'running', started_at = unixepoch(), user_message_id = ? WHERE id = ?",
        )
        .run(messageId, item.id);
      return messageId;
    });
    return tx();
  }

  setQueueStatus(queueId: number, status: QueueStatus, error?: string) {
    this.db
      .query(
        "UPDATE queue SET status = ?, error = ?, updated_at = unixepoch() WHERE id = ?",
      )
      .run(status, error ?? null, queueId);
  }

  appendAssistant(sessionId: string, queueId: number, content: string) {
    this.requireSession(sessionId);
    appendAssistantMessage(this.db, sessionId, queueId, content);
  }

  replaceHistory(sessionId: string, messages: BaseMessage[]) {
    this.requireSession(sessionId);
    replaceMessages(this.db, sessionId, messages, { clearStreamEvents: true });
  }

  history(sessionId: string): BaseMessage[] {
    this.requireSession(sessionId);
    return loadMessages(this.db, sessionId);
  }

  control(sessionId: string): Control {
    return readControlRecord(this.db, sessionId);
  }

  setControl(sessionId: string, control: Control) {
    writeControlRecord(this.db, sessionId, control);
    this.event(sessionId, "info", "client", "control", { control });
  }

  touchSession(sessionId: string) {
    touchSessionRecord(this.db, sessionId);
  }

  event(
    sessionId: string,
    level: string,
    category: string,
    message: string,
    payload: unknown,
  ) {
    this.db
      .query(
        "INSERT INTO events (session_id, level, category, message, payload_json, created_at) VALUES (?, ?, ?, ?, ?, unixepoch())",
      )
      .run(sessionId, level, category, message, JSON.stringify(payload));
    this.notify?.();
  }

  streamToken(sessionId: string, queueId: number, text: string) {
    this.event(sessionId, "info", "stream", "token", {
      kind: "assistant_text_delta",
      queueId,
      text,
    });
  }

  streamToolCall(
    sessionId: string,
    queueId: number,
    call: StreamToolCallDelta,
  ) {
    this.event(sessionId, "info", "stream", "tool_call", {
      kind: "tool_call_delta",
      queueId,
      call,
    });
  }

  private requireSession(sessionId: string) {
    requireSessionRecord(this.db, sessionId);
  }
}
