import type { Database } from "bun:sqlite";
import { pruneUnreferencedMessages } from "../infrastructure/database/records/messages/history";
import { runTransaction } from "../infrastructure/database/connection";

export function deleteThreadData(db: Database, threadId: string) {
  runTransaction(db, () => {
    db.run("DELETE FROM checkpoints WHERE thread_id = ?", [threadId]);
    db.run("DELETE FROM writes WHERE thread_id = ?", [threadId]);
    pruneUnreferencedMessages(db);
  });
}
