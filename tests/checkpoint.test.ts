import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, expect, test } from "bun:test";
import { BunSqliteSaver } from "../src/checkpointer";

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
