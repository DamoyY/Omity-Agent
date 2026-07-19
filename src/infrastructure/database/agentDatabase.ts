import type { Control, QueueItem, QueueStatus } from "../../types";
import {
  type StreamEvent,
  type StreamEventDraft,
  deleteQueueStream,
  finishToolStreams,
  insertStreamEvent,
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
import {
  closeDatabase,
  configureDatabase,
  reclaimDatabasePages,
  runTransaction,
} from "./connection";
import {
  createSessionRecord,
  hasSessionRecord,
  readControlRecord,
  readWorkspaceRecord,
  requireSessionRecord,
  touchSessionRecord,
  writeControlRecord,
} from "./records/sessions";
import { loadMessages, queueMessageId } from "./records/messages/history";
import type { BaseMessage } from "@langchain/core/messages";
import { Database } from "bun:sqlite";
import type { ErrorDetails } from "../../failures/details";
import { RecoverableDatabase } from "./records/recovery";
import { applySchema } from "./schema";
import { resetSessionStorage } from "./maintenance";
import { syncMessages } from "./records/messages/sync";

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
    runTransaction(this.db, () => {
      resetSessionStorage(this.db, sessionId, workspace);
    });
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
    const { event, queueId } = runTransaction(this.db, () => {
      const insertedQueueId = appendUserQueue(this.db, sessionId, content);
      const insertedEvent = insertStreamEvent(this.db, sessionId, {
        kind: "user_appended",
        messageId: queueMessageId(sessionId, insertedQueueId),
        partId: "user",
        queueId: insertedQueueId,
        value: null,
      });
      touchSessionRecord(this.db, sessionId);
      return { event: insertedEvent, queueId: insertedQueueId };
    });
    this.notify?.(event);
    return queueId;
  }
  appendDraft(sessionId: string, content: string) {
    this.requireSession(sessionId);
    return runTransaction(this.db, () => {
      const queueId = appendDraftQueue(this.db, sessionId, content);
      touchSessionRecord(this.db, sessionId);
      return queueId;
    });
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
    return runTransaction(this.db, () => startQueueRecord(this.db, sessionId, item));
  }
  setQueueStatus(queueId: number, status: QueueStatus, error?: ErrorDetails) {
    runTransaction(this.db, () => {
      setQueueStatusRecord(this.db, queueId, status, error);
      if (status === "done" || status === "canceled") {
        deleteQueueStream(this.db, queueId);
      }
    });
  }
  queueStatus(queueId: number) {
    return queueStatusRecord(this.db, queueId);
  }
  syncHistory(sessionId: string, messages: BaseMessage[]) {
    this.requireSession(sessionId);
    const finished = runTransaction(this.db, () => {
      syncMessages(this.db, sessionId, messages);
      const events = finishToolStreams(this.db, sessionId, messages);
      clearToolCancellations(this.db, sessionId);
      return events;
    });
    for (const event of finished) {
      this.notify?.(event);
    }
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
  appendStream(sessionId: string, event: StreamEventDraft) {
    return this.notifyStream(insertStreamEvent(this.db, sessionId, event));
  }
  discardQueueStream(queueId: number) {
    deleteQueueStream(this.db, queueId);
  }
  private notifyStream<T extends StreamEvent>(event: T) {
    this.notify?.(event);
    return event;
  }
  private requireSession(sessionId: string) {
    requireSessionRecord(this.db, sessionId);
  }
}
