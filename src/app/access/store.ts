import type { AuthenticatorTransportFuture, WebAuthnCredential } from "@simplewebauthn/server";
import { createHash, randomBytes } from "node:crypto";
import { Database } from "bun:sqlite";
import { configureDatabase } from "../../infrastructure/database/connection";
import { join } from "node:path";
import { z } from "zod";

interface CredentialRow {
  counter: number;
  id: string;
  public_key: Uint8Array;
  transports_json: string | null;
}
interface ChallengeRow {
  challenge: string;
  expires_at: number;
}
const transportsSchema = z.array(
  z.enum(["ble", "cable", "hybrid", "internal", "nfc", "smart-card", "usb"]),
);
export class AccessStore {
  private readonly db: Database;
  constructor(dataDir: string) {
    this.db = new Database(join(dataDir, "access.sqlite"), { create: true, strict: true });
    try {
      configureDatabase(this.db);
      this.db.transaction(() => {
        this.db.run(`
        CREATE TABLE IF NOT EXISTS credentials (
          id TEXT PRIMARY KEY,
          public_key BLOB NOT NULL,
          counter INTEGER NOT NULL,
          transports_json TEXT,
          created_at INTEGER NOT NULL
        )`);
        this.db.run(`
        CREATE TABLE IF NOT EXISTS challenges (
          id TEXT PRIMARY KEY,
          challenge TEXT NOT NULL,
          purpose TEXT NOT NULL CHECK (purpose IN ('registration', 'authentication')),
          expires_at INTEGER NOT NULL
        )`);
        this.db.run(`
        CREATE TABLE IF NOT EXISTS access_sessions (
          token_hash BLOB PRIMARY KEY,
          expires_at INTEGER NOT NULL
        )`);
        this.db.run(`
        CREATE TABLE IF NOT EXISTS registration_tickets (
          token_hash BLOB PRIMARY KEY,
          expires_at INTEGER NOT NULL
        )`);
      })();
    } catch (error) {
      this.db.close(true);
      throw error;
    }
  }
  close() {
    this.db.close(true);
  }
  credentialCount() {
    return (
      this.db.query<{ count: number }, []>("SELECT COUNT(*) AS count FROM credentials").get()
        ?.count ?? 0
    );
  }
  credentials(): WebAuthnCredential[] {
    return this.db
      .query<CredentialRow, []>("SELECT * FROM credentials ORDER BY created_at")
      .all()
      .map(toCredential);
  }
  credential(id: string): WebAuthnCredential | undefined {
    const row = this.db
      .query<CredentialRow, [string]>("SELECT * FROM credentials WHERE id = ?")
      .get(id);
    return row ? toCredential(row) : undefined;
  }
  addCredential(credential: WebAuthnCredential) {
    this.db
      .query(
        `INSERT INTO credentials (id, public_key, counter, transports_json, created_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(
        credential.id,
        credential.publicKey,
        credential.counter,
        credential.transports ? JSON.stringify(credential.transports) : null,
        Date.now(),
      );
  }
  updateCounter(id: string, counter: number) {
    const result = this.db
      .query("UPDATE credentials SET counter = MAX(counter, ?) WHERE id = ?")
      .run(counter, id);
    if (result.changes !== 1) {
      throw new Error(`WebAuthn 凭据不存在：${id}`);
    }
  }
  createChallenge(purpose: "registration" | "authentication", challenge: string, ttlMs: number) {
    this.removeExpired();
    const id = randomToken();
    this.db
      .query("INSERT INTO challenges (id, challenge, purpose, expires_at) VALUES (?, ?, ?, ?)")
      .run(id, challenge, purpose, Date.now() + ttlMs);
    return id;
  }
  consumeChallenge(id: string, purpose: "registration" | "authentication") {
    return this.db.transaction(() => {
      const row = this.db
        .query<ChallengeRow, [string, string]>(
          "SELECT challenge, expires_at FROM challenges WHERE id = ? AND purpose = ?",
        )
        .get(id, purpose);
      this.db.query("DELETE FROM challenges WHERE id = ?").run(id);
      if (!row || row.expires_at <= Date.now()) {
        throw new Error("WebAuthn 挑战不存在或已过期");
      }
      return row.challenge;
    })();
  }
  createSession(ttlMs: number) {
    this.removeExpired();
    const token = randomToken();
    this.db
      .query("INSERT INTO access_sessions (token_hash, expires_at) VALUES (?, ?)")
      .run(tokenHash(token), Date.now() + ttlMs);
    return token;
  }
  createRegistrationTicket(ttlMs: number) {
    this.removeExpired();
    const token = randomToken();
    this.db
      .query("INSERT INTO registration_tickets (token_hash, expires_at) VALUES (?, ?)")
      .run(tokenHash(token), Date.now() + ttlMs);
    return token;
  }
  consumeRegistrationTicket(token: string) {
    return this.db.transaction(() => {
      const hash = tokenHash(token);
      const row = this.db
        .query<{ expires_at: number }, [Uint8Array]>(
          "SELECT expires_at FROM registration_tickets WHERE token_hash = ?",
        )
        .get(hash);
      this.db.query("DELETE FROM registration_tickets WHERE token_hash = ?").run(hash);
      if (!row || row.expires_at <= Date.now()) {
        throw new Error("WebAuthn 注册链接不存在或已过期");
      }
    })();
  }
  hasSession(token?: string) {
    if (!token) {
      return false;
    }
    const row = this.db
      .query<{ expires_at: number }, [Uint8Array]>(
        "SELECT expires_at FROM access_sessions WHERE token_hash = ?",
      )
      .get(tokenHash(token));
    return row !== null && row.expires_at > Date.now();
  }
  deleteSession(token?: string) {
    if (token) {
      this.db.query("DELETE FROM access_sessions WHERE token_hash = ?").run(tokenHash(token));
    }
  }
  private removeExpired() {
    const now = Date.now();
    this.db.query("DELETE FROM challenges WHERE expires_at <= ?").run(now);
    this.db.query("DELETE FROM access_sessions WHERE expires_at <= ?").run(now);
    this.db.query("DELETE FROM registration_tickets WHERE expires_at <= ?").run(now);
  }
}
function toCredential(row: CredentialRow): WebAuthnCredential {
  const transports = row.transports_json
    ? (transportsSchema.parse(JSON.parse(row.transports_json)) as AuthenticatorTransportFuture[])
    : undefined;
  return {
    counter: row.counter,
    id: row.id,
    publicKey: new Uint8Array(row.public_key),
    ...(transports ? { transports } : {}),
  };
}
function randomToken() {
  return randomBytes(32).toString("base64url");
}
function tokenHash(token: string) {
  return createHash("sha256").update(token).digest();
}
