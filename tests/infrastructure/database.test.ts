import { afterEach, expect, test } from "bun:test";
import { appendAssistantMessage } from "../../src/infrastructure/messages";
import {
  cleanupDatabaseDirs,
  makeDatabases,
  makeDb,
  required,
  workspace,
} from "../support/database";

afterEach(cleanupDatabaseDirs);

test("queue append and transcript lifecycle", () => {
  const db = makeDb();
  db.resetSession("123", workspace);
  const queueId = db.appendUser("123", "你好");
  const item = db.nextQueue("123");
  expect(item?.id).toBe(queueId);
  db.startQueue("123", required(item));
  expect(db.history("123").map((message) => message.text)).toEqual(["你好"]);
  appendAssistantMessage(db.db, "123", queueId, "你好，有什么可以帮你？");
  db.setQueueStatus(queueId, "done");
  expect(db.history("123").at(-1)?.text).toBe("你好，有什么可以帮你？");
  db.close();
});

test("existing sessions are explicit", () => {
  const db = makeDb();
  expect(db.hasSession("123")).toBe(false);
  db.createSession("123", workspace);
  expect(db.hasSession("123")).toBe(true);
  expect(() => {
    db.createSession("123", workspace);
  }).toThrow("会话已存在：123");
  db.close();
});

test("client operations reject missing sessions", () => {
  const db = makeDb();
  expect(() => db.appendUser("missing", "你好")).toThrow("会话不存在：missing");
  expect(() => {
    db.setControl("missing", "pause");
  }).toThrow("会话不存在：missing");
  db.close();
});

test("host lease excludes concurrent owners and permits takeover after expiry", () => {
  const databases = makeDatabases(2);
  const first = required(databases[0]);
  const second = required(databases[1]);
  first.resetSession("123", workspace);

  expect(
    first.acquireHostLease({
      sessionId: "123",
      ownerId: "host-a",
      now: 1_000,
      ttlMs: 100,
    }),
  ).toBe(true);
  expect(
    second.acquireHostLease({
      sessionId: "123",
      ownerId: "host-b",
      now: 1_050,
      ttlMs: 100,
    }),
  ).toBe(false);
  expect(
    second.renewHostLease({
      sessionId: "123",
      ownerId: "host-b",
      now: 1_050,
      ttlMs: 100,
    }),
  ).toBe(false);
  expect(
    second.acquireHostLease({
      sessionId: "123",
      ownerId: "host-b",
      now: 1_101,
      ttlMs: 100,
    }),
  ).toBe(true);
  expect(first.releaseHostLease("123", "host-a")).toBe(false);
  expect(second.releaseHostLease("123", "host-b")).toBe(true);
  first.close();
  second.close();
});

test("queue start atomically rejects a stale claim", () => {
  const db = makeDb();
  db.resetSession("123", workspace);
  db.appendUser("123", "只应写入一次");
  const stale = required(db.nextQueue("123"));

  db.startQueue("123", stale);

  expect(() => db.startQueue("123", stale)).toThrow("队列认领冲突");
  expect(db.history("123").map((message) => message.text)).toEqual([
    "只应写入一次",
  ]);
  db.close();
});
