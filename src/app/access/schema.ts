import type { Database } from "bun:sqlite";
import { runTransaction } from "../../infrastructure/database/connection";

export function applyAccessSchema(db: Database) {
  runTransaction(db, () => {
    db.run(`
      CREATE TABLE IF NOT EXISTS credentials (
        id TEXT PRIMARY KEY,
        public_key BLOB NOT NULL,
        counter INTEGER NOT NULL,
        transports_json TEXT,
        created_at INTEGER NOT NULL
      )`);
    db.run(`
      CREATE TABLE IF NOT EXISTS challenges (
        id TEXT PRIMARY KEY,
        challenge TEXT NOT NULL,
        purpose TEXT NOT NULL CHECK (purpose IN ('registration', 'authentication')),
        expires_at INTEGER NOT NULL
      )`);
    db.run(`
      CREATE TABLE IF NOT EXISTS access_sessions (
        token_hash BLOB PRIMARY KEY,
        expires_at INTEGER NOT NULL
      )`);
    db.run(`
      CREATE TABLE IF NOT EXISTS registration_tickets (
        token_hash BLOB PRIMARY KEY,
        expires_at INTEGER NOT NULL
      )`);
  });
}
