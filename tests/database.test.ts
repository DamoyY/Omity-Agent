import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { AIMessage, HumanMessage } from "@langchain/core/messages";
import { afterEach, expect, test } from "bun:test";
import { forkDatabaseBeforeMessage } from "../src/app/fork";
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

const workspace = "F:\\workspace\\test";

test("queue append and transcript lifecycle", () => {
  const db = makeDb();
  db.resetSession("123", workspace);
  const queueId = db.appendUser("123", "你好");
  const item = db.nextQueue("123");
  expect(item?.id).toBe(queueId);
  db.startQueue("123", item!);
  expect(db.history("123").map((message) => message.text)).toEqual(["你好"]);
  db.appendAssistant("123", queueId, "你好，有什么可以帮你？");
  db.setQueueStatus(queueId, "done");
  expect(db.history("123").at(-1)?.text).toBe("你好，有什么可以帮你？");
  db.close();
});

test("transcript preserves full LangChain message structure", () => {
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
  db.replaceHistory("123", [
    new HumanMessage("问题"),
    new AIMessage({
      content: [{ type: "text", text: "答案", annotations: [] }],
      additional_kwargs: { reasoning },
      response_metadata: { model_provider: "openai", output },
    }),
  ]);

  const restored = db.history("123");

  expect(restored.map((message) => message.text)).toEqual(["问题", "答案"]);
  expect(restored[1]).toBeInstanceOf(AIMessage);
  expect(restored[1]?.additional_kwargs["reasoning"]).toEqual(reasoning);
  expect(
    (restored[1]?.response_metadata as Record<string, unknown> | undefined)?.[
      "output"
    ],
  ).toEqual(output);
  db.close();
});

test("replace history clears redundant stream events", () => {
  const db = makeDb();
  db.resetSession("123", workspace);
  db.streamToken("123", 1, "答案");
  db.streamToolCall("123", 1, { id: "call-1", name: "tool" });
  db.event("123", "info", "client", "append", { queueId: 1 });

  db.replaceHistory("123", [new HumanMessage("问题"), new AIMessage("答案")]);

  const rows = db.db
    .query<{ category: string }, []>("SELECT category FROM events ORDER BY id")
    .all();
  expect(rows.map((row) => row.category)).toEqual(["client"]);
  db.close();
});

test("control is stored in sql", () => {
  const db = makeDb();
  db.ensureSession("123", workspace);
  db.setControl("123", "pause");
  expect(db.control("123")).toBe("pause");
  db.setControl("123", "running");
  expect(db.control("123")).toBe("running");
  db.close();
});

test("existing sessions are explicit", () => {
  const db = makeDb();
  expect(db.hasSession("123")).toBe(false);
  db.createSession("123", workspace);
  expect(db.hasSession("123")).toBe(true);
  expect(() => db.createSession("123", workspace)).toThrow("会话已存在：123");
  db.close();
});

test("client operations reject missing sessions", () => {
  const db = makeDb();
  expect(() => db.appendUser("missing", "你好")).toThrow("会话不存在：missing");
  expect(() => db.setControl("missing", "pause")).toThrow(
    "会话不存在：missing",
  );
  db.close();
});

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
  expect(target.nextQueue("target")).toBeNull();
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
