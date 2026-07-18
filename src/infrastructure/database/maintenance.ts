import type { Database } from "bun:sqlite";
import { clearStreamEvents } from "./records/streamEvents";
import { createSessionRecord } from "./records/sessions";

export function resetSessionStorage(db: Database, sessionId: string, workspace: string) {
  db.run("DELETE FROM writes");
  db.run("DELETE FROM checkpoints");
  db.run("DELETE FROM hook_usage");
  db.run("DELETE FROM host_leases");
  clearStreamEvents(db, sessionId);
  db.run("DELETE FROM messages WHERE session_id = ?", [sessionId]);
  db.run("DELETE FROM queue WHERE session_id = ?", [sessionId]);
  db.run("DELETE FROM sessions WHERE id = ?", [sessionId]);
  createSessionRecord(db, sessionId, workspace);
}
