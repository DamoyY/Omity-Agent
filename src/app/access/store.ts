import type { AuthenticatorTransportFuture, WebAuthnCredential } from "@simplewebauthn/server";
import {
  closeDatabase,
  configureDatabase,
  queryAll,
  queryGet,
  runTransaction,
} from "../../infrastructure/database/connection";
import { createHash, randomBytes } from "node:crypto";
import { Database } from "bun:sqlite";
import { applyAccessSchema } from "./schema";
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
      applyAccessSchema(this.db);
    } catch (error) {
      closeDatabase(this.db);
      throw error;
    }
  }
  close() {
    closeDatabase(this.db);
  }
  credentialCount() {
    return (
      queryGet<{ count: number }>(this.db, "SELECT COUNT(*) AS count FROM credentials")?.count ?? 0
    );
  }
  credentials(): WebAuthnCredential[] {
    return queryAll<CredentialRow>(this.db, "SELECT * FROM credentials ORDER BY created_at").map(
      toCredential,
    );
  }
  credential(id: string): WebAuthnCredential | undefined {
    const row = queryGet<CredentialRow>(this.db, "SELECT * FROM credentials WHERE id = ?", id);
    return row ? toCredential(row) : undefined;
  }
  addCredential(credential: WebAuthnCredential) {
    this.db.run(
      `INSERT INTO credentials (id, public_key, counter, transports_json, created_at)
       VALUES (?, ?, ?, ?, ?)`,
      [
        credential.id,
        credential.publicKey,
        credential.counter,
        credential.transports ? JSON.stringify(credential.transports) : null,
        Date.now(),
      ],
    );
  }
  updateCounter(id: string, counter: number) {
    const result = this.db.run("UPDATE credentials SET counter = MAX(counter, ?) WHERE id = ?", [
      counter,
      id,
    ]);
    if (result.changes !== 1) {
      throw new Error(`WebAuthn 凭据不存在：${id}`);
    }
  }
  createChallenge(purpose: "registration" | "authentication", challenge: string, ttlMs: number) {
    this.removeExpired();
    const id = randomToken();
    this.db.run("INSERT INTO challenges (id, challenge, purpose, expires_at) VALUES (?, ?, ?, ?)", [
      id,
      challenge,
      purpose,
      Date.now() + ttlMs,
    ]);
    return id;
  }
  consumeChallenge(id: string, purpose: "registration" | "authentication") {
    return runTransaction(this.db, () => {
      const row = queryGet<ChallengeRow>(
        this.db,
        "SELECT challenge, expires_at FROM challenges WHERE id = ? AND purpose = ?",
        id,
        purpose,
      );
      this.db.run("DELETE FROM challenges WHERE id = ?", [id]);
      if (!row || row.expires_at <= Date.now()) {
        throw new Error("WebAuthn 挑战不存在或已过期");
      }
      return row.challenge;
    });
  }
  createSession(ttlMs: number) {
    this.removeExpired();
    const token = randomToken();
    this.db.run("INSERT INTO access_sessions (token_hash, expires_at) VALUES (?, ?)", [
      tokenHash(token),
      Date.now() + ttlMs,
    ]);
    return token;
  }
  createRegistrationTicket(ttlMs: number) {
    this.removeExpired();
    const token = randomToken();
    this.db.run("INSERT INTO registration_tickets (token_hash, expires_at) VALUES (?, ?)", [
      tokenHash(token),
      Date.now() + ttlMs,
    ]);
    return token;
  }
  consumeRegistrationTicket(token: string) {
    return runTransaction(this.db, () => {
      const hash = tokenHash(token);
      const row = queryGet<{ expires_at: number }>(
        this.db,
        "SELECT expires_at FROM registration_tickets WHERE token_hash = ?",
        hash,
      );
      this.db.run("DELETE FROM registration_tickets WHERE token_hash = ?", [hash]);
      if (!row || row.expires_at <= Date.now()) {
        throw new Error("WebAuthn 注册链接不存在或已过期");
      }
    });
  }
  hasSession(token?: string) {
    if (!token) {
      return false;
    }
    const row = queryGet<{ expires_at: number }>(
      this.db,
      "SELECT expires_at FROM access_sessions WHERE token_hash = ?",
      tokenHash(token),
    );
    return row !== null && row.expires_at > Date.now();
  }
  deleteSession(token?: string) {
    if (token) {
      this.db.run("DELETE FROM access_sessions WHERE token_hash = ?", [tokenHash(token)]);
    }
  }
  private removeExpired() {
    const now = Date.now();
    this.db.run("DELETE FROM challenges WHERE expires_at <= ?", [now]);
    this.db.run("DELETE FROM access_sessions WHERE expires_at <= ?", [now]);
    this.db.run("DELETE FROM registration_tickets WHERE expires_at <= ?", [now]);
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
