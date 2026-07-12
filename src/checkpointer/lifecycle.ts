import type { Database } from "bun:sqlite";
import { pruneMessageBlobs } from "../infrastructure/messageBlobs";

export function deleteThreadData(db: Database, threadId: string) {
  db.transaction(() => {
    db.query("DELETE FROM checkpoints WHERE thread_id = ?").run(threadId);
    db.query("DELETE FROM writes WHERE thread_id = ?").run(threadId);
    if (hasTable(db, "invocations")) {
      db.query("DELETE FROM invocations WHERE thread_id = ?").run(threadId);
    }
    if (hasTable(db, "messages") && hasTable(db, "invocations")) {
      db.run(
        `DELETE FROM messages
         WHERE position IS NULL
           AND id NOT IN (
             SELECT output_message_id FROM invocations
             WHERE output_message_id IS NOT NULL
           )`,
      );
    }
    if (hasTable(db, "message_blobs")) pruneMessageBlobs(db);
  })();
}

function hasTable(db: Database, name: string) {
  return (
    db
      .query<{ value: number }, [string]>(
        "SELECT 1 AS value FROM sqlite_schema WHERE type = 'table' AND name = ?",
      )
      .get(name) !== null
  );
}
