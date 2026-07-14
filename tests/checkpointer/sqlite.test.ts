import { afterEach, expect, test } from "bun:test";
import { AgentDatabase } from "../../src/infrastructure/database/agentDatabase";
import { BunSqliteSaver } from "../../src/checkpointer";
import { createTestDirectory } from "../support/artifacts";
import { join } from "node:path";
import { rmSync } from "node:fs";

const dirs: string[] = [];
const databases: AgentDatabase[] = [];
afterEach(() => {
  for (const db of databases.splice(0)) {
    db.close();
  }
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { force: true, recursive: true });
  }
});
function makePath() {
  const dir = createTestDirectory("checkpoints");
  dirs.push(dir);
  return join(dir, "checkpoints.sqlite");
}
function openSaver(path = makePath()) {
  const db = new AgentDatabase(path);
  databases.push(db);
  return { db, saver: new BunSqliteSaver(db.db, "session") };
}
function closeDatabase(db: AgentDatabase) {
  db.close();
  databases.splice(databases.indexOf(db), 1);
}
test("Bun sqlite checkpointer persists checkpoints and writes", async () => {
  const path = makePath();
  const first = openSaver(path);
  first.db.createSession("session", dirs.at(-1) ?? "");
  const { saver } = first;
  const saved = await saver.put(
    { configurable: { thread_id: "thread-1" } },
    {
      channel_values: { messages: ["hello"] },
      channel_versions: { messages: 1 },
      id: "00000000-0000-6000-8000-000000000001",
      ts: new Date(0).toISOString(),
      v: 4,
      versions_seen: {},
    },
    { parents: {}, source: "input", step: -1 },
  );
  await saver.putWrites(saved, [["messages", "pending"]], "task-1");
  closeDatabase(first.db);
  const reopenedDatabase = openSaver(path);
  const reopened = reopenedDatabase.saver;
  const loaded = await reopened.getTuple({
    configurable: { thread_id: "thread-1" },
  });
  expect(loaded?.checkpoint.id).toBe("00000000-0000-6000-8000-000000000001");
  expect(loaded?.metadata?.source).toBe("input");
  expect(loaded?.pendingWrites).toEqual([["task-1", "messages", "pending"]]);
  await reopened.deleteThread("thread-1");
  expect(await reopened.getTuple({ configurable: { thread_id: "thread-1" } })).toBeUndefined();
  closeDatabase(reopenedDatabase.db);
});
test("pending writes keep deterministic order and per-channel conflicts", async () => {
  const { saver } = openSaver();
  const saved = await putCheckpoint(saver, "thread", "", checkpointId(1));
  await saver.putWrites(
    saved,
    [
      ["__error__", "old error"],
      ["messages", "old message"],
    ],
    "task-b",
  );
  await saver.putWrites(
    saved,
    [
      ["__error__", "new error"],
      ["messages", "new message"],
    ],
    "task-b",
  );
  await saver.putWrites(saved, [["messages", "first task"]], "task-a");
  const loaded = await saver.getTuple(saved);
  expect(loaded?.pendingWrites).toEqual([
    ["task-a", "messages", "first task"],
    ["task-b", "__error__", "new error"],
    ["task-b", "messages", "old message"],
  ]);
});
function putCheckpoint(saver: BunSqliteSaver, threadId: string, checkpointNs: string, id: string) {
  return saver.put(
    { configurable: { checkpoint_ns: checkpointNs, thread_id: threadId } },
    checkpoint(id),
    { parents: {}, source: "input", step: -1 },
  );
}
function checkpoint(id: string) {
  return {
    channel_values: {},
    channel_versions: {},
    id,
    ts: new Date(0).toISOString(),
    v: 4,
    versions_seen: {},
  };
}
function checkpointId(index: number) {
  return `00000000-0000-6000-8000-${index.toString().padStart(12, "0")}`;
}
