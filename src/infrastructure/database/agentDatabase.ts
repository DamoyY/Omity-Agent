import type { Control, QueueItem, QueueStatus } from "../../types";
import {
  type StreamEvent,
  clearQueueStreamEvents,
  clearStreamEvents,
  insertStreamReasoning,
  insertStreamToken,
  insertStreamToolCall,
  insertToolStarted,
} from "./records/streamEvents";
import {
  appendDraftQueue,
  appendUserQueue,
  consumedRunRows,
  nextQueueRow,
  pendingAppendRows,
  queueStatusRecord,
  setQueueStatusRecord,
  startQueueRecord,
} from "./records/queue/operations";
import {
  clearToolCancellations,
  requestToolCancellation,
  takeToolCancellation,
} from "./records/toolCancellations";
import { closeDatabase, configureDatabase, reclaimDatabasePages } from "./connection";
import {
  createSessionRecord,
  hasSessionRecord,
  readControlRecord,
  readWorkspaceRecord,
  requireSessionRecord,
  touchSessionRecord,
  writeControlRecord,
} from "./records/sessions";
import type { BaseMessage } from "@langchain/core/messages";
import { Database } from "bun:sqlite";
import type { ErrorDetails } from "../../failures/details";
import { RecoverableDatabase } from "./records/recovery";
import { applySchema } from "./schema";
import { loadMessages } from "./records/messages/history";
import { resetSessionStorage } from "./maintenance";
import { syncMessages } from "./records/messages/sync";

type DatabaseArgs<T> = T extends (db: Database, ...args: infer Args) => unknown ? Args : never;
export class AgentDatabase extends RecoverableDatabase {
  private notify?: (event: StreamEvent) => void;
  private storageReclaimPending = false;
  constructor(path: string) {
    const db = new Database(path, { create: true, strict: true });
    try {
      configureDatabase(db);
      applySchema(db);
    } catch (error) {
      closeDatabase(db);
      throw error;
    }
    super(db);
  }
  close() {
    closeDatabase(this.db);
  }
  onChange(notify: (event: StreamEvent) => void) {
    this.notify = notify;
  }
  resetSession(sessionId: string, workspace: string) {
    this.db.transaction(() => {
      resetSessionStorage(this.db, sessionId, workspace);
    })();
  }
  requestStorageReclaim() {
    this.storageReclaimPending = true;
  }
  reclaimStorageIfPending() {
    if (!this.storageReclaimPending) {
      return true;
    }
    const reclaimed = reclaimDatabasePages(this.db);
    this.storageReclaimPending = !reclaimed;
    return reclaimed;
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
    return this.db.transaction(() => startQueueRecord(this.db, sessionId, item))();
  }
  setQueueStatus(queueId: number, status: QueueStatus, error?: ErrorDetails) {
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
      clearToolCancellations(this.db, sessionId);
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
  requestToolCancellation(sessionId: string, callId: string) {
    this.requireSession(sessionId);
    requestToolCancellation(this.db, sessionId, callId);
  }
  takeToolCancellation(sessionId: string, callId: string) {
    return takeToolCancellation(this.db, sessionId, callId);
  }
  streamToken(...args: DatabaseArgs<typeof insertStreamToken>) {
    return this.notifyStream(insertStreamToken(this.db, ...args));
  }
  streamReasoning(...args: DatabaseArgs<typeof insertStreamReasoning>) {
    return this.notifyStream(insertStreamReasoning(this.db, ...args));
  }
  streamToolCall(...args: DatabaseArgs<typeof insertStreamToolCall>) {
    return this.notifyStream(insertStreamToolCall(this.db, ...args));
  }
  toolStarted(...args: DatabaseArgs<typeof insertToolStarted>) {
    return this.notifyStream(insertToolStarted(this.db, ...args));
  }
  private notifyStream<T extends StreamEvent>(event: T) {
    this.notify?.(event);
    return event;
  }
  private requireSession(sessionId: string) {
    requireSessionRecord(this.db, sessionId);
  }
}
