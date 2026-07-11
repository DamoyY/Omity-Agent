import { AIMessage, HumanMessage } from "@langchain/core/messages";
import { afterEach, expect, test } from "bun:test";
import {
  cleanupDatabaseDirs,
  makeDb,
  required,
  workspace,
} from "../support/database";

afterEach(cleanupDatabaseDirs);

test("preserves full LangChain message structure", () => {
  const db = makeDb();
  db.resetSession("123", workspace);
  const reasoning = {
    id: "rs_1",
    type: "reasoning",
    encrypted_content: "sealed",
    summary: [{ type: "summary_text", text: "visible summary" }],
  };
  const output = [
    reasoning,
    {
      type: "message",
      role: "assistant",
      content: [{ type: "output_text", text: "答案", annotations: [] }],
    },
  ];
  db.syncHistory("123", [
    new HumanMessage("问题"),
    new AIMessage({
      content: [{ type: "text", text: "答案", annotations: [] }],
      additional_kwargs: { reasoning },
      response_metadata: { model_provider: "openai", output },
    }),
  ]);

  const restored = db.history("123");

  expect(restored.map((message) => message.text)).toEqual(["问题", "答案"]);
  const assistant = required(restored[1]);
  expect(assistant).toBeInstanceOf(AIMessage);
  expect(assistant.additional_kwargs["reasoning"]).toEqual(reasoning);
  expect(assistant.response_metadata).toEqual({
    model_provider: "openai",
    output,
  });
  db.close();
});

test("clears redundant stream events", () => {
  const db = makeDb();
  db.resetSession("123", workspace);
  db.streamToken("123", 1, "答案");
  db.streamToolCall("123", 1, { id: "call-1", name: "tool" });
  db.event("123", "info", "client", "append", { queueId: 1 });

  db.syncHistory("123", [new HumanMessage("问题"), new AIMessage("答案")]);

  const rows = db.db
    .query<{ category: string }, []>("SELECT category FROM events ORDER BY id")
    .all();
  expect(rows.map((row) => row.category)).toEqual(["client"]);
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
  db.syncHistory("123", [
    required(db.history("123")[0]),
    new AIMessage("修订稿"),
  ]);
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
    "SELECT id, created_at FROM messages ORDER BY id",
  );
  try {
    return query.all();
  } finally {
    query.finalize();
  }
}

function queueMessageRowId(db: ReturnType<typeof makeDb>, queueId: number) {
  const query = db.db.prepare<{ user_message_id: number }, [number]>(
    "SELECT user_message_id FROM queue WHERE id = ?",
  );
  try {
    return query.get(queueId)?.user_message_id;
  } finally {
    query.finalize();
  }
}
