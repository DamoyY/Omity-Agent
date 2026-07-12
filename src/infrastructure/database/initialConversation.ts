import type { BaseMessage } from "@langchain/core/messages";
import type { Database } from "bun:sqlite";
import { syncMessages } from "./records/messages/history";
import { appendUserQueue } from "./records/queue/operations";
import { requireSessionRecord, touchSessionRecord } from "./records/sessions";

export function initializeConversation(
  db: Database,
  sessionId: string,
  history: BaseMessage[],
  pendingUser: string,
) {
  requireSessionRecord(db, sessionId);
  return db.transaction(() => {
    syncMessages(db, sessionId, history);
    const queueId = appendUserQueue(db, sessionId, pendingUser);
    touchSessionRecord(db, sessionId);
    return queueId;
  })();
}
