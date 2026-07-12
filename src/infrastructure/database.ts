import { Database } from "bun:sqlite";
import type { BaseMessage } from "@langchain/core/messages";
import type { Control, QueueItem, QueueStatus } from "../types";
import {
  clearQueueStreamEvents,
  clearStreamEvents,
  insertStreamToken,
  insertStreamToolCall,
  type StreamToolCallDelta,
} from "./eventRecords";
import { loadMessages, syncMessages } from "./messages";
import {
  appendDraftQueue,
  appendUserQueue,
  consumedRunRows,
  nextQueueRow,
  pendingAppendRows,
  queueStatusRecord,
  setQueueStatusRecord,
  startQueueRecord,
} from "./queueRecords";
import { applySchema } from "./schema";
import { closeDatabase, configureDatabase } from "./sqlite";
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
    try {
      configureDatabase(this.db);
      applySchema(this.db);
    } catch (error) {
      closeDatabase(this.db);
      throw error;
    }
  }

  close() {
    closeDatabase(this.db);
  }

  onChange(notify: () => void) {
    this.notify = notify;
  }

  resetSession(sessionId: string, workspace: string) {
    const tx = this.db.transaction(() => {
      this.db.query("DELETE FROM writes").run();
      this.db.query("DELETE FROM checkpoints").run();
      this.db.query("DELETE FROM invocations").run();
      this.db.query("DELETE FROM hook_usage").run();
      this.db.query("DELETE FROM host_leases").run();
      clearStreamEvents(this.db, sessionId);
      this.db.query("DELETE FROM messages WHERE session_id = ?").run(sessionId);
      this.db.query("DELETE FROM message_blobs").run();
      this.db.query("DELETE FROM queue WHERE session_id = ?").run(sessionId);
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
    const tx = this.db.transaction(() => {
      const queueId = appendUserQueue(this.db, sessionId, content);
      touchSessionRecord(this.db, sessionId);
      return queueId;
    });
    return tx();
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

  consumedRunItems(sessionId: string, runId: number | null): QueueItem[] {
    return consumedRunRows(this.db, sessionId, runId);
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
    const tx = this.db.transaction(() => {
      setQueueStatusRecord(this.db, queueId, status, error);
      if (status === "done" || status === "canceled") {
        clearQueueStreamEvents(this.db, queueId);
      }
    });
    tx();
  }

  queueStatus(queueId: number) {
    return queueStatusRecord(this.db, queueId);
  }

  syncHistory(sessionId: string, messages: BaseMessage[]) {
    this.requireSession(sessionId);
    const tx = this.db.transaction(() => {
      syncMessages(this.db, sessionId, messages);
      clearStreamEvents(this.db, sessionId);
    });
    tx();
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
