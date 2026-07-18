import { requireSessionRecord, touchSessionRecord } from "./records/sessions";
import type { BaseMessage } from "@langchain/core/messages";
import type { Database } from "bun:sqlite";
import { appendUserQueue } from "./records/queue/operations";
import { runTransaction } from "./connection";
import { syncMessages } from "./records/messages/sync";

export function initializeConversation(
  db: Database,
  sessionId: string,
  history: BaseMessage[],
  pendingUser: string,
) {
  requireSessionRecord(db, sessionId);
  return runTransaction(db, () => {
    syncMessages(db, sessionId, history);
    const queueId = appendUserQueue(db, sessionId, pendingUser);
    touchSessionRecord(db, sessionId);
    return queueId;
  });
}
