import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, expect, test } from "bun:test";
import { AgentDatabase } from "../src/infrastructure/database";

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function makeDb() {
  const dir = mkdtempSync(join(tmpdir(), "agent-db-"));
  dirs.push(dir);
  return new AgentDatabase(join(dir, "app.sqlite"));
}

test("queue append and transcript lifecycle", () => {
  const db = makeDb();
  db.resetSession("123");
  const queueId = db.appendUser("123", "你好");
  const item = db.nextQueue("123");
  expect(item?.id).toBe(queueId);
  db.startQueue("123", item!);
  expect(db.history("123")).toEqual([{ role: "user", content: "你好" }]);
  db.appendAssistant("123", queueId, "你好，有什么可以帮你？");
  db.setQueueStatus(queueId, "done");
  expect(db.history("123").at(-1)).toEqual({
    role: "assistant",
    content: "你好，有什么可以帮你？",
  });
  db.close();
});

test("control is stored in sql", () => {
  const db = makeDb();
  db.ensureSession("123");
  db.setControl("123", "pause");
  expect(db.control("123")).toBe("pause");
  db.setControl("123", "running");
  expect(db.control("123")).toBe("running");
  db.close();
});
