import type { Database } from "bun:sqlite";
import { pruneUnreferencedMessages } from "../infrastructure/database/records/messages/history";

export function deleteThreadData(db: Database, threadId: string) {
  db.transaction(() => {
    db.query("DELETE FROM checkpoints WHERE thread_id = ?").run(threadId);
    db.query("DELETE FROM writes WHERE thread_id = ?").run(threadId);
    pruneUnreferencedMessages(db);
  })();
}
