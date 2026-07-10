import { afterEach, expect, test } from "bun:test";
import { forkDatabaseBeforeMessage } from "../src/app/fork";
import { cleanupDatabaseDirs, makeDb, workspace } from "./support/database";

afterEach(cleanupDatabaseDirs);

test("fork copies messages before selected user message", () => {
  const source = makeDb();
  const target = makeDb();
  source.resetSession("source", workspace);
  const first = source.appendUser("source", "第一条");
  source.startQueue("source", source.nextQueue("source")!);
  source.appendAssistant("source", first, "第一条回复");
  source.setQueueStatus(first, "done");
  const forkPoint = source.appendUser("source", "不要复制");
  source.startQueue("source", source.nextQueue("source")!);
  source.appendAssistant("source", forkPoint, "也不要复制");

  forkDatabaseBeforeMessage({
    source,
    target,
    sourceSessionId: "source",
    targetSessionId: "target",
    workspace,
    beforeMessageId: forkPoint,
  });

  expect(target.history("target").map((message) => message.text)).toEqual([
    "第一条",
    "第一条回复",
  ]);
  expect(target.control("target")).toBe("running");
  expect(target.nextQueue("target")).toMatchObject({
    content: "不要复制",
    status: "draft",
    userMessageId: null,
  });
  source.close();
  target.close();
});

test("first user message cannot fork", () => {
  const source = makeDb();
  const target = makeDb();
  source.resetSession("source", workspace);
  const first = source.appendUser("source", "第一条");
  source.startQueue("source", source.nextQueue("source")!);

  expect(() =>
    forkDatabaseBeforeMessage({
      source,
      target,
      sourceSessionId: "source",
      targetSessionId: "target",
      workspace,
      beforeMessageId: first,
    }),
  ).toThrow("每个 session 的第一条用户消息不能 Fork");
  source.close();
  target.close();
});

test("fork point must be a user message", () => {
  const source = makeDb();
  const target = makeDb();
  source.resetSession("source", workspace);
  const queueId = source.appendUser("source", "问题");
  source.startQueue("source", source.nextQueue("source")!);
  source.appendAssistant("source", queueId, "回答");
  const assistantRow = source.db
    .query<{ id: number }, []>(
      "SELECT id FROM messages WHERE session_id = 'source' ORDER BY id DESC LIMIT 1",
    )
    .get();

  expect(() =>
    forkDatabaseBeforeMessage({
      source,
      target,
      sourceSessionId: "source",
      targetSessionId: "target",
      workspace,
      beforeMessageId: assistantRow!.id,
    }),
  ).toThrow("只能从用户消息创建 Fork");
  source.close();
  target.close();
});
