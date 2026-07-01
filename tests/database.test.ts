import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { AIMessage, HumanMessage } from "@langchain/core/messages";
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
  expect(db.history("123").map((message) => message.text)).toEqual(["你好"]);
  db.appendAssistant("123", queueId, "你好，有什么可以帮你？");
  db.setQueueStatus(queueId, "done");
  expect(db.history("123").at(-1)?.text).toBe("你好，有什么可以帮你？");
  db.close();
});

test("transcript preserves full LangChain message structure", () => {
  const db = makeDb();
  db.resetSession("123");
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

test("control is stored in sql", () => {
  const db = makeDb();
  db.ensureSession("123");
  db.setControl("123", "pause");
  expect(db.control("123")).toBe("pause");
  db.setControl("123", "running");
  expect(db.control("123")).toBe("running");
  db.close();
});

test("existing sessions are explicit", () => {
  const db = makeDb();
  expect(db.hasSession("123")).toBe(false);
  db.createSession("123");
  expect(db.hasSession("123")).toBe(true);
  expect(() => db.createSession("123")).toThrow("会话已存在：123");
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
