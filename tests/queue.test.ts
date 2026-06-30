import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AIMessage } from "@langchain/core/messages";
import { fakeModel } from "@langchain/core/testing";
import { MemorySaver } from "@langchain/langgraph-checkpoint";
import { createAgent } from "langchain";
import { afterEach, expect, test } from "bun:test";
import { AgentDatabase } from "../src/infrastructure/database";
import { Logger } from "../src/infrastructure/logger";
import { processQueue } from "../src/runtime/queue";
import type { HostContext } from "../src/runtime/context";
import type { Settings } from "../src/types";

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("append is consumed at a LangGraph boundary", async () => {
  const db = makeDb();
  db.resetSession("123");
  db.appendUser("123", "第一条");
  db.appendUser("123", "第二条");
  const item = db.nextQueue("123");
  const model = fakeModel()
    .respond(new AIMessage("中间响应"))
    .respond((messages) => {
      const contents = messages.map((message) => message.content);
      expect(contents).toEqual(["第一条", "中间响应", "第二条"]);
      return new AIMessage("最终响应");
    });
  const graph = createAgent({
    model,
    tools: [],
    checkpointer: new MemorySaver(),
  });
  await processQueue(makeContext(db, graph), item!);
  expect(model.callCount).toBe(2);
  expect(db.nextQueue("123")).toBeNull();
  expect(db.history("123")).toEqual([
    { role: "user", content: "第一条" },
    { role: "user", content: "第二条" },
    { role: "assistant", content: "最终响应" },
  ]);
  db.close();
});

test("cancel while paused stops host without ending pause", async () => {
  const db = makeDb();
  db.resetSession("123");
  db.appendUser("123", "暂停中的输入");
  db.setControl("123", "pause_cancel");
  const item = db.nextQueue("123");

  await processQueue(makeContext(db, {}), item!);

  expect(db.control("123")).toBe("pause");
  expect(db.nextQueue("123")?.status).toBe("paused");
  db.close();
});

test("ctrl-c while paused stops host without ending pause", async () => {
  const db = makeDb();
  db.resetSession("123");
  db.appendUser("123", "暂停中的输入");
  db.setControl("123", "pause");
  const item = db.nextQueue("123");
  const context = makeContext(db, {});
  context.signal.stopping = true;

  await processQueue(context, item!);

  expect(db.control("123")).toBe("pause");
  expect(db.nextQueue("123")?.status).toBe("paused");
  db.close();
});

function makeDb() {
  const dir = mkdtempSync(join(tmpdir(), "agent-queue-"));
  dirs.push(dir);
  return new AgentDatabase(join(dir, "app.sqlite"));
}

function makeContext(db: AgentDatabase, graph: unknown): HostContext {
  return {
    settings: makeSettings(),
    logger: new Logger("error"),
    db,
    graph,
    checkpointer: new MemorySaver() as unknown as HostContext["checkpointer"],
    sessionId: "123",
    signal: { stopping: false },
  };
}

function makeSettings(): Settings {
  return {
    paths: { dataDir: "data" },
    model: {
      provider: "openai-compatible",
      api: "completions",
      model: "test-model",
      apiKeyEnv: "TEST_OPENAI_KEY",
      baseURL: null,
      temperature: 0,
      maxRetries: 0,
      timeoutMs: 1000,
    },
    host: {
      pollMs: 1,
      pausePollMs: 1,
      idleLogMs: 1,
      recursionLimit: 10,
    },
    logging: {
      level: "error",
      streamTokens: false,
    },
    agent: {
      systemPrompt: "test",
    },
    skills: {
      enabled: false,
      directory: "~/agents/skills",
      usagePrompt: "use skills",
      skillEnabled: {},
    },
  };
}
