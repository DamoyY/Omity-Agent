import { AIMessage } from "@langchain/core/messages";
import { fakeModel } from "@langchain/core/testing";
import { MemorySaver } from "@langchain/langgraph-checkpoint";
import { createAgent } from "langchain";
import { afterEach, expect, test } from "bun:test";
import { AgentDatabase } from "../../src/infrastructure/database";
import { Logger } from "../../src/infrastructure/logger";
import {
  isModelNetworkError,
  modelNetworkRetryDelayMs,
} from "../../src/runtime/network";
import { processQueue } from "../../src/runtime/queue";
import type { HostContext } from "../../src/runtime/context";
import type { Settings } from "../../src/types";
import { cleanupDatabaseDirs, makeDb, workspace } from "../support/database";

afterEach(cleanupDatabaseDirs);

test("append is consumed at a LangGraph boundary", async () => {
  const db = makeDb();
  db.resetSession("123", workspace);
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
  expect(db.history("123").map((message) => message.text)).toEqual([
    "第一条",
    "中间响应",
    "第二条",
    "最终响应",
  ]);
  db.close();
});

test("unexpected errors pause the queue", async () => {
  const db = makeDb();
  db.resetSession("123", workspace);
  db.appendUser("123", "会失败的输入");
  const item = db.nextQueue("123");
  const graph = {
    stream: async () => {
      throw new Error("boom");
    },
  };

  await processQueue(makeContext(db, graph), item!);

  expect(db.nextQueue("123")?.status).toBe("paused");
  expect(db.control("123")).toBe("pause");
  db.close();
});

test("cancel while paused stops host without ending pause", async () => {
  const db = makeDb();
  db.resetSession("123", workspace);
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
  db.resetSession("123", workspace);
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

test("detects retryable model network errors", () => {
  expect(isModelNetworkError(new Error("fetch failed"))).toBe(true);
  expect(
    isModelNetworkError(
      new Error("Received empty response from chat model call."),
    ),
  ).toBe(true);
  expect(isModelNetworkError({ code: "ECONNRESET" })).toBe(true);
  expect(isModelNetworkError({ name: "TimeoutError" })).toBe(true);
  expect(isModelNetworkError({ cause: { code: "ENOTFOUND" } })).toBe(true);
  expect(isModelNetworkError(new Error("Unexpected EOF"))).toBe(true);
  expect(isModelNetworkError({ name: "AbortError" })).toBe(false);
});

test("model network retry delay grows with a cap", () => {
  expect(modelNetworkRetryDelayMs(1)).toBe(1_000);
  expect(modelNetworkRetryDelayMs(2)).toBe(2_000);
  expect(modelNetworkRetryDelayMs(99)).toBe(30_000);
});

function makeContext(db: AgentDatabase, graph: unknown): HostContext {
  return {
    settings: makeSettings(),
    logger: new Logger("error"),
    db,
    graph,
    checkpointer: new MemorySaver() as unknown as HostContext["checkpointer"],
    hooks: {
      identity: { last: () => undefined },
      runSilentChain: async () => {},
    } as never,
    beforeModelNode: "model_request",
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
    logging: { level: "error", streamTokens: false },
    toolOutput: { maxTokens: 8192 },
    hooks: [],
    agent: { systemPrompt: "test" },
    skills: {
      enabled: false,
      directory: "~/.agents/skills",
      usagePrompt: "use skills",
      skillEnabled: {},
    },
  };
}
