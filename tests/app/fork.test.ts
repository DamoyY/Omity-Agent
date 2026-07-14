import { AIMessage, ToolMessage } from "@langchain/core/messages";
import { afterEach, expect, test } from "bun:test";
import { cleanupDatabaseDirs, makeDb, required, workspace } from "../support/database";
import { appendAssistantMessage } from "../../src/infrastructure/database/records/messages/history";
import { forkDatabaseBeforeMessage } from "../../src/app/fork";
afterEach(cleanupDatabaseDirs);
test("fork copies messages before selected user message", () => {
  const source = makeDb();
  const target = makeDb();
  source.resetSession("source", workspace);
  const first = source.appendUser("source", "第一条");
  source.startQueue("source", required(source.nextQueue("source")));
  appendAssistantMessage(source.db, "source", "第一条回复");
  source.setQueueStatus(first, "done");
  const forkPoint = source.appendUser("source", "不要复制");
  source.startQueue("source", required(source.nextQueue("source")));
  appendAssistantMessage(source.db, "source", "也不要复制");
  const forkMessageId = userMessageId(source, forkPoint);
  forkDatabaseBeforeMessage({
    beforeMessageId: forkMessageId,
    source,
    sourceSessionId: "source",
    target,
    targetSessionId: "target",
    workspace,
  });
  expect(target.history("target").map((message) => message.text)).toEqual(["第一条", "第一条回复"]);
  expect(target.control("target")).toBe("running");
  expect(readOnlyQueue(target)).toMatchObject({
    content: "不要复制",
    status: "draft",
    user_message_id: null,
  });
  source.close();
  target.close();
});
test("first user message cannot fork", () => {
  const source = makeDb();
  const target = makeDb();
  source.resetSession("source", workspace);
  const first = source.appendUser("source", "第一条");
  source.startQueue("source", required(source.nextQueue("source")));
  const firstMessageId = userMessageId(source, first);
  expect(() => {
    forkDatabaseBeforeMessage({
      beforeMessageId: firstMessageId,
      source,
      sourceSessionId: "source",
      target,
      targetSessionId: "target",
      workspace,
    });
  }).toThrow("每个 session 的第一条用户消息不能 Fork");
  source.close();
  target.close();
});
function userMessageId(db: ReturnType<typeof makeDb>, queueId: number) {
  const query = db.db.prepare<{ id: number }, [number]>(
    "SELECT id FROM messages WHERE queue_id = ?",
  );
  try {
    return required(query.get(queueId)).id;
  } finally {
    query.finalize();
  }
}
function readOnlyQueue(db: ReturnType<typeof makeDb>) {
  const query = db.db.prepare<
    { content: string; status: string; user_message_id: number | null },
    []
  >(
    `SELECT q.content, q.status, m.id AS user_message_id
     FROM queue q LEFT JOIN messages m ON m.queue_id = q.id
     ORDER BY q.id LIMIT 1`,
  );
  try {
    return query.get();
  } finally {
    query.finalize();
  }
}
test("fork point must be a user message", () => {
  const source = makeDb();
  const target = makeDb();
  source.resetSession("source", workspace);
  source.appendUser("source", "问题");
  source.startQueue("source", required(source.nextQueue("source")));
  appendAssistantMessage(source.db, "source", "回答");
  const assistantRow = latestMessageId(source);
  expect(() => {
    forkDatabaseBeforeMessage({
      beforeMessageId: assistantRow,
      source,
      sourceSessionId: "source",
      target,
      targetSessionId: "target",
      workspace,
    });
  }).toThrow("只能从用户消息创建 Fork");
  source.close();
  target.close();
});
function latestMessageId(db: ReturnType<typeof makeDb>) {
  const query = db.db.prepare<{ id: number }, []>(
    "SELECT id FROM messages ORDER BY id DESC LIMIT 1",
  );
  try {
    return required(query.get()).id;
  } finally {
    query.finalize();
  }
}
test("fork preserves completed takeover pairs in an editable draft", () => {
  const source = makeDb();
  const target = makeDb();
  source.resetSession("source", workspace);
  source.appendUser("source", "第一条");
  source.startQueue("source", required(source.nextQueue("source")));
  source.syncHistory("source", [
    ...source.history("source"),
    new AIMessage({
      content: "",
      tool_calls: [{ args: {}, id: "hook-call", name: "format" }],
    }),
    new ToolMessage({
      content: "formatted",
      name: "format",
      tool_call_id: "hook-call",
    }),
    new AIMessage("第一条回复"),
  ]);
  const appended = source.appendUser("source", "第二条");
  const appendItem = required(source.pendingAppends("source")[0]);
  source.startQueue("source", appendItem);
  const forkPoint = { id: userMessageId(source, appended) };
  forkDatabaseBeforeMessage({
    beforeMessageId: forkPoint.id,
    source,
    sourceSessionId: "source",
    target,
    targetSessionId: "target",
    workspace,
  });
  expect(target.history("target").map((message) => message.type)).toEqual([
    "human",
    "ai",
    "tool",
    "ai",
  ]);
  expect(target.control("target")).toBe("running");
  expect(readOnlyQueue(target)).toMatchObject({
    content: "第二条",
    status: "draft",
    user_message_id: null,
  });
  source.close();
  target.close();
});
