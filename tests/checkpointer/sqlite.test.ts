import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, expect, test } from "bun:test";
import { TASKS } from "@langchain/langgraph-checkpoint";
import { BunSqliteSaver } from "../../src/checkpointer";

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function makePath() {
  const dir = mkdtempSync(join(tmpdir(), "agent-checkpoint-"));
  dirs.push(dir);
  return join(dir, "checkpoints.sqlite");
}

test("Bun sqlite checkpointer persists checkpoints and writes", async () => {
  const path = makePath();
  const saver = new BunSqliteSaver(path);
  const saved = await saver.put(
    { configurable: { thread_id: "thread-1" } },
    {
      v: 4,
      id: "00000000-0000-6000-8000-000000000001",
      ts: new Date(0).toISOString(),
      channel_values: { messages: ["hello"] },
      channel_versions: { messages: 1 },
      versions_seen: {},
    },
    { source: "input", step: -1, parents: {} },
  );
  await saver.putWrites(saved, [["messages", "pending"]], "task-1");
  saver.close();

  const reopened = new BunSqliteSaver(path);
  const loaded = await reopened.getTuple({
    configurable: { thread_id: "thread-1" },
  });
  expect(loaded?.checkpoint.id).toBe("00000000-0000-6000-8000-000000000001");
  expect(loaded?.metadata?.source).toBe("input");
  expect(loaded?.pendingWrites).toEqual([["task-1", "messages", "pending"]]);
  await reopened.deleteThread("thread-1");
  expect(
    await reopened.getTuple({ configurable: { thread_id: "thread-1" } }),
  ).toBeUndefined();
  reopened.close();
});

test("pending writes keep deterministic order and per-channel conflicts", async () => {
  const saver = new BunSqliteSaver(makePath());
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
  saver.close();
});

test("legacy pending sends stay inside their checkpoint namespace", async () => {
  const saver = new BunSqliteSaver(makePath());
  const parentId = checkpointId(1);
  const parentA = await putCheckpoint(saver, "thread", "a", parentId);
  const parentB = await putCheckpoint(saver, "thread", "b", parentId);
  await saver.putWrites(parentA, [[TASKS, "from-a"]], "task");
  await saver.putWrites(parentB, [[TASKS, "from-b"]], "task");
  const child = await saver.put(
    parentA,
    {
      ...checkpoint(checkpointId(2)),
      v: 3,
    },
    { source: "loop", step: 0, parents: {} },
  );

  const loaded = await saver.getTuple(child);

  expect(loaded?.checkpoint.channel_values[TASKS]).toEqual(["from-a"]);
  saver.close();
});

function putCheckpoint(
  saver: BunSqliteSaver,
  threadId: string,
  checkpointNs: string,
  id: string,
) {
  return saver.put(
    { configurable: { thread_id: threadId, checkpoint_ns: checkpointNs } },
    checkpoint(id),
    { source: "input", step: -1, parents: {} },
  );
}

function checkpoint(id: string) {
  return {
    v: 4,
    id,
    ts: new Date(0).toISOString(),
    channel_values: {},
    channel_versions: {},
    versions_seen: {},
  };
}

function checkpointId(index: number) {
  return `00000000-0000-6000-8000-${index.toString().padStart(12, "0")}`;
}
