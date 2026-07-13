import type { Database } from "bun:sqlite";
import { clearStreamEvents } from "./records/streamEvents";
import { createSessionRecord } from "./records/sessions";

export function resetSessionStorage(
  db: Database,
  sessionId: string,
  workspace: string,
) {
  db.query("DELETE FROM writes").run();
  db.query("DELETE FROM checkpoints").run();
  db.query("DELETE FROM hook_usage").run();
  db.query("DELETE FROM host_leases").run();
  clearStreamEvents(db, sessionId);
  db.query("DELETE FROM messages WHERE session_id = ?").run(sessionId);
  db.query("DELETE FROM message_blobs").run();
  db.query("DELETE FROM queue WHERE session_id = ?").run(sessionId);
  db.query("DELETE FROM sessions WHERE id = ?").run(sessionId);
  createSessionRecord(db, sessionId, workspace);
}
