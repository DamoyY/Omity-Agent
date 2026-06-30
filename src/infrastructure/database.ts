import { Database } from "bun:sqlite";
import type {
  Control,
  QueueItem,
  QueueStatus,
  TranscriptMessage,
} from "../types";
import { migrationSql } from "./schema";

type QueueRow = {
  id: number;
  content: string;
  status: QueueStatus;
  user_message_id: number | null;
};

export class AgentDatabase {
  readonly db: Database;

  constructor(path: string) {
    this.db = new Database(path, { create: true, strict: true });
    this.db.run("PRAGMA journal_mode = WAL");
    this.db.run("PRAGMA foreign_keys = ON");
    this.migrate();
  }

  close() {
    this.db.close();
  }

  resetSession(sessionId: string) {
    const tx = this.db.transaction(() => {
      this.db.query("DELETE FROM queue WHERE session_id = ?").run(sessionId);
      this.db.query("DELETE FROM messages WHERE session_id = ?").run(sessionId);
      this.db.query("DELETE FROM events WHERE session_id = ?").run(sessionId);
      this.db.query("DELETE FROM sessions WHERE id = ?").run(sessionId);
      this.createSession(sessionId);
    });
    tx();
  }

  createSession(sessionId: string) {
    if (this.hasSession(sessionId)) {
      throw new Error(`会话已存在：${sessionId}`);
    }
    const result = this.db
      .query(
        "INSERT INTO sessions (id, control, status, created_at, updated_at) VALUES (?, 'running', 'idle', unixepoch(), unixepoch())",
      )
      .run(sessionId);
    if (result.changes !== 1) {
      throw new Error(`会话已存在：${sessionId}`);
    }
  }

  ensureSession(sessionId: string) {
    this.db
      .query(
        "INSERT OR IGNORE INTO sessions (id, control, status, created_at, updated_at) VALUES (?, 'running', 'idle', unixepoch(), unixepoch())",
      )
      .run(sessionId);
  }

  hasSession(sessionId: string) {
    const row = this.db
      .query<{ value: number }, [string]>(
        "SELECT 1 AS value FROM sessions WHERE id = ?",
      )
      .get(sessionId);
    return row !== null && row !== undefined;
  }

  appendUser(sessionId: string, content: string) {
    this.requireSession(sessionId);
    const result = this.db
      .query(
        "INSERT INTO queue (session_id, content, status, created_at) VALUES (?, ?, 'pending', unixepoch())",
      )
      .run(sessionId, content);
    this.event(sessionId, "info", "client", "append", {
      queueId: Number(result.lastInsertRowid),
    });
    return Number(result.lastInsertRowid);
  }

  nextQueue(sessionId: string): QueueItem | null {
    const row = this.db
      .query<QueueRow, [string]>(
        "SELECT id, content, status, user_message_id FROM queue WHERE session_id = ? AND status IN ('pending', 'running', 'paused') ORDER BY id LIMIT 1",
      )
      .get(sessionId);
    return row
      ? {
          id: row.id,
          content: row.content,
          status: row.status,
          userMessageId: row.user_message_id,
        }
      : null;
  }

  startQueue(sessionId: string, item: QueueItem) {
    if (item.userMessageId !== null) {
      this.setQueueStatus(item.id, "running");
      return item.userMessageId;
    }
    const tx = this.db.transaction(() => {
      const msg = this.db
        .query(
          "INSERT INTO messages (session_id, role, content, queue_id, created_at) VALUES (?, 'user', ?, ?, unixepoch())",
        )
        .run(sessionId, item.content, item.id);
      const messageId = Number(msg.lastInsertRowid);
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
    this.db
      .query(
        "INSERT INTO messages (session_id, role, content, queue_id, created_at) VALUES (?, 'assistant', ?, ?, unixepoch())",
      )
      .run(sessionId, content, queueId);
  }

  history(sessionId: string): TranscriptMessage[] {
    this.requireSession(sessionId);
    return this.db
      .query<{ role: "user" | "assistant"; content: string }, [string]>(
        "SELECT role, content FROM messages WHERE session_id = ? ORDER BY id",
      )
      .all(sessionId);
  }

  control(sessionId: string): Control {
    this.requireSession(sessionId);
    const row = this.db
      .query<{ control: Control }, [string]>(
        "SELECT control FROM sessions WHERE id = ?",
      )
      .get(sessionId);
    if (!row) {
      throw new Error(`会话不存在：${sessionId}`);
    }
    return row.control;
  }

  setControl(sessionId: string, control: Control) {
    this.requireSession(sessionId);
    this.db
      .query(
        "UPDATE sessions SET control = ?, updated_at = unixepoch() WHERE id = ?",
      )
      .run(control, sessionId);
    this.event(sessionId, "info", "client", "control", { control });
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
  }

  private migrate() {
    for (const sql of migrationSql) {
      this.db.run(sql);
    }
  }

  private requireSession(sessionId: string) {
    if (!this.hasSession(sessionId)) {
      throw new Error(`会话不存在：${sessionId}`);
    }
  }
}
