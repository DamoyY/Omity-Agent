import { AIMessage, HumanMessage } from "@langchain/core/messages";
import { afterEach, expect, test } from "bun:test";
import { cleanupDatabaseDirs, makeDb, required, workspace } from "../support/database";
import { initializeConversation } from "../../src/infrastructure/database/initialConversation";

afterEach(cleanupDatabaseDirs);
test("initial conversation keeps history outside the pending queue", () => {
  const db = makeDb();
  db.resetSession("123", workspace);
  const queueId = initializeConversation(
    db.db,
    "123",
    [
      new HumanMessage("历史问题一"),
      new AIMessage("历史回答一"),
      new HumanMessage("历史问题二"),
      new AIMessage("历史回答二"),
    ],
    "当前问题",
  );
  expect(db.history("123").map((message) => message.text)).toEqual([
    "历史问题一",
    "历史回答一",
    "历史问题二",
    "历史回答二",
  ]);
  expect(db.pendingAppends("123").map(({ id, content }) => ({ content, id }))).toEqual([
    { content: "当前问题", id: queueId },
  ]);
  db.startQueue("123", required(db.nextQueue("123")));
  expect(db.history("123").map((message) => message.text)).toEqual([
    "历史问题一",
    "历史回答一",
    "历史问题二",
    "历史回答二",
    "当前问题",
  ]);
  db.close();
});
test("persists only replay and display message fields", () => {
  const db = makeDb();
  db.resetSession("123", workspace);
  const reasoning = {
    id: "rs_1",
    summary: [{ text: "visible summary", type: "summary_text" }],
    type: "reasoning",
  };
  const output = [
    { ...reasoning, encrypted_content: "sealed" },
    {
      content: [{ annotations: [], text: "答案", type: "output_text" }],
      role: "assistant",
      type: "message",
    },
  ];
  db.syncHistory("123", [
    new HumanMessage("问题"),
    new AIMessage({
      additional_kwargs: { reasoning },
      content: [{ annotations: [], text: "答案", type: "text" }],
      response_metadata: {
        instructions: "do not persist",
        model_provider: "openai",
        output,
        tools: [{ name: "do not persist" }],
      },
    }),
  ]);
  const restored = db.history("123");
  expect(restored.map((message) => message.text)).toEqual(["问题", "答案"]);
  const assistant = required(restored[1]);
  expect(assistant).toBeInstanceOf(AIMessage);
  expect(assistant.additional_kwargs["reasoning"]).toEqual({
    ...reasoning,
    encrypted_content: "sealed",
  });
  expect(assistant.response_metadata).toEqual({});
  const stored = required(
    db.db
      .query<{ message_json: string }, []>("SELECT message_json FROM messages WHERE position = 1")
      .get(),
  ).message_json;
  expect(stored).not.toContain("do not persist");
  db.close();
});
test("persists user boundaries while clearing transient stream deltas", () => {
  const db = makeDb();
  db.resetSession("123", workspace);
  const queueId = db.appendUser("123", "问题");
  db.setControl("123", "pause");
  db.appendStream("123", {
    kind: "assistant_text_delta",
    messageId: "message-1",
    partId: "text-1",
    queueId: 1,
    value: "答案",
  });
  db.appendStream("123", {
    kind: "tool_call_delta",
    messageId: "message-1",
    partId: "tool-0",
    queueId: 1,
    value: { idDelta: "call-1", index: 0, nameDelta: "tool" },
  });
  const events = db.db
    .query<
      {
        kind: string;
        message_id: string;
        part_id: string;
        payload_json: string;
        queue_id: number;
      },
      []
    >("SELECT queue_id, message_id, part_id, kind, payload_json FROM events ORDER BY id")
    .all();
  expect(queueId).toBe(1);
  expect(events).toEqual([
    {
      kind: "user_appended",
      message_id: "queue:123:1",
      part_id: "user",
      payload_json: "null",
      queue_id: 1,
    },
    {
      kind: "assistant_text_delta",
      message_id: "message-1",
      part_id: "text-1",
      payload_json: '"答案"',
      queue_id: 1,
    },
    {
      kind: "tool_call_delta",
      message_id: "message-1",
      part_id: "tool-0",
      payload_json: '{"idDelta":"call-1","index":0,"nameDelta":"tool"}',
      queue_id: 1,
    },
  ]);
  db.syncHistory("123", [new HumanMessage("问题"), new AIMessage("答案")]);
  expect(db.db.query("SELECT kind FROM events").all()).toEqual([{ kind: "user_appended" }]);
  db.close();
});
test("clears stream deltas when their queue becomes terminal", () => {
  const db = makeDb();
  db.resetSession("123", workspace);
  const queueId = db.appendUser("123", "问题");
  db.appendStream("123", {
    kind: "assistant_text_delta",
    messageId: "message-1",
    partId: "text-1",
    queueId,
    value: "未完成",
  });
  db.setQueueStatus(queueId, "canceled");
  expect(db.db.query("SELECT id FROM events").all()).toEqual([]);
  db.close();
});
test("retains the unchanged prefix and queue message identity", () => {
  const db = makeDb();
  db.resetSession("123", workspace);
  const queueId = db.appendUser("123", "问题");
  db.startQueue("123", required(db.nextQueue("123")));
  const original = messageRows(db);
  db.syncHistory("123", [...db.history("123"), new AIMessage("初稿")]);
  const firstSync = messageRows(db);
  db.syncHistory("123", [required(db.history("123")[0]), new AIMessage("修订稿")]);
  const secondSync = messageRows(db);
  const queueMessageId = queueMessageRowId(db, queueId);
  db.close();
  expect(firstSync[0]).toEqual(original[0]);
  expect(secondSync[0]).toEqual(original[0]);
  expect(secondSync[1]?.id).not.toBe(firstSync[1]?.id);
  expect(queueMessageId).toBe(original[0]?.id);
});
function messageRows(db: ReturnType<typeof makeDb>) {
  const query = db.db.prepare<{ id: number; created_at: number }, []>(
    "SELECT id, created_at FROM messages WHERE position IS NOT NULL ORDER BY position",
  );
  try {
    return query.all();
  } finally {
    query.finalize();
  }
}
function queueMessageRowId(db: ReturnType<typeof makeDb>, queueId: number) {
  const query = db.db.prepare<{ user_message_id: number }, [number]>(
    "SELECT id AS user_message_id FROM messages WHERE queue_id = ?",
  );
  try {
    return query.get(queueId)?.user_message_id;
  } finally {
    query.finalize();
  }
}
