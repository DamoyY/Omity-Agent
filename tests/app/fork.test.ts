import { AIMessage, ToolMessage } from "@langchain/core/messages";
import { afterEach, expect, test } from "bun:test";
import { forkDatabaseBeforeMessage } from "../../src/app/fork";
import { appendAssistantMessage } from "../../src/infrastructure/messages";
import {
  cleanupDatabaseDirs,
  makeDb,
  required,
  workspace,
} from "../support/database";

afterEach(cleanupDatabaseDirs);

test("fork copies messages before selected user message", () => {
  const source = makeDb();
  const target = makeDb();
  source.resetSession("source", workspace);
  const first = source.appendUser("source", "第一条");
  source.startQueue("source", required(source.nextQueue("source")));
  appendAssistantMessage(source.db, "source", first, "第一条回复");
  source.setQueueStatus(first, "done");
  const forkPoint = source.appendUser("source", "不要复制");
  source.startQueue("source", required(source.nextQueue("source")));
  appendAssistantMessage(source.db, "source", forkPoint, "也不要复制");
  const forkMessageId = userMessageId(source, forkPoint);

  forkDatabaseBeforeMessage({
    source,
    target,
    sourceSessionId: "source",
    targetSessionId: "target",
    workspace,
    beforeMessageId: forkMessageId,
  });

  expect(target.history("target").map((message) => message.text)).toEqual([
    "第一条",
    "第一条回复",
  ]);
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
      source,
      target,
      sourceSessionId: "source",
      targetSessionId: "target",
      workspace,
      beforeMessageId: firstMessageId,
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
  >("SELECT content, status, user_message_id FROM queue ORDER BY id LIMIT 1");
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
  const queueId = source.appendUser("source", "问题");
  source.startQueue("source", required(source.nextQueue("source")));
  appendAssistantMessage(source.db, "source", queueId, "回答");
  const assistantRow = latestMessageId(source);

  expect(() => {
    forkDatabaseBeforeMessage({
      source,
      target,
      sourceSessionId: "source",
      targetSessionId: "target",
      workspace,
      beforeMessageId: assistantRow,
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
      tool_calls: [{ id: "hook-call", name: "format", args: {} }],
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
    source,
    target,
    sourceSessionId: "source",
    targetSessionId: "target",
    workspace,
    beforeMessageId: forkPoint.id,
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
