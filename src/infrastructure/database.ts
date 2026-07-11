import { Database } from "bun:sqlite";
import type { BaseMessage } from "@langchain/core/messages";
import type { Control, QueueItem, QueueStatus } from "../types";
import {
  insertEvent,
  insertStreamToken,
  insertStreamToolCall,
  type StreamToolCallDelta,
} from "./eventRecords";
import { loadMessages, replaceMessages } from "./messages";
import {
  appendDraftQueue,
  appendUserQueue,
  nextQueueRow,
  pendingAppendRows,
  setQueueStatusRecord,
  startQueueRecord,
} from "./queueRecords";
import { applySchema } from "./schema";
import {
  acquireHostLeaseRecord,
  createSessionRecord,
  hasSessionRecord,
  readControlRecord,
  readWorkspaceRecord,
  releaseHostLeaseRecord,
  renewHostLeaseRecord,
  requireSessionRecord,
  touchSessionRecord,
  writeControlRecord,
  type HostLeaseClaim,
} from "./sessionRecords";

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
      this.db.query("DELETE FROM runs WHERE session_id = ?").run(sessionId);
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

  hasSession(sessionId: string) {
    return hasSessionRecord(this.db, sessionId);
  }

  workspace(sessionId: string) {
    return readWorkspaceRecord(this.db, sessionId);
  }

  appendUser(sessionId: string, content: string) {
    this.requireSession(sessionId);
    const queueId = this.db.transaction(() =>
      appendUserQueue(this.db, sessionId, content),
    )();
    touchSessionRecord(this.db, sessionId);
    this.event(sessionId, "info", "client", "append", {
      queueId,
    });
    return queueId;
  }

  appendDraft(sessionId: string, content: string) {
    this.requireSession(sessionId);
    const tx = this.db.transaction(() => {
      const queueId = appendDraftQueue(this.db, sessionId, content);
      touchSessionRecord(this.db, sessionId);
      return queueId;
    });
    return tx();
  }

  pendingAppends(sessionId: string): QueueItem[] {
    return pendingAppendRows(this.db, sessionId);
  }

  nextQueue(sessionId: string): QueueItem | null {
    return nextQueueRow(this.db, sessionId);
  }

  startQueue(sessionId: string, item: QueueItem) {
    return this.db.transaction(() =>
      startQueueRecord(this.db, sessionId, item),
    )();
  }

  setQueueStatus(queueId: number, status: QueueStatus, error?: string) {
    setQueueStatusRecord(this.db, queueId, status, error);
  }

  replaceHistory(sessionId: string, messages: BaseMessage[]) {
    this.requireSession(sessionId);
    replaceMessages(this.db, sessionId, messages, {
      clearStreamEvents: true,
    });
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

  acquireHostLease(claim: HostLeaseClaim) {
    return acquireHostLeaseRecord(this.db, claim);
  }

  renewHostLease(claim: HostLeaseClaim) {
    return renewHostLeaseRecord(this.db, claim);
  }

  releaseHostLease(sessionId: string, ownerId: string) {
    return releaseHostLeaseRecord(this.db, sessionId, ownerId);
  }

  event(
    sessionId: string,
    level: string,
    category: string,
    message: string,
    payload: unknown,
  ) {
    insertEvent(this.db, sessionId, level, category, message, payload);
    this.notify?.();
  }

  streamToken(
    sessionId: string,
    queueId: number,
    text: string,
    messageId?: string,
  ) {
    insertStreamToken(this.db, sessionId, queueId, text, messageId);
    this.notify?.();
  }

  streamToolCall(
    sessionId: string,
    queueId: number,
    call: StreamToolCallDelta,
    messageId?: string,
  ) {
    insertStreamToolCall(this.db, sessionId, queueId, call, messageId);
    this.notify?.();
  }

  private requireSession(sessionId: string) {
    requireSessionRecord(this.db, sessionId);
  }
}
