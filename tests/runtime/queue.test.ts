import { AIMessage } from "@langchain/core/messages";
import { fakeModel } from "@langchain/core/testing";
import { MemorySaver } from "@langchain/langgraph-checkpoint";
import { createAgent } from "langchain";
import { afterEach, expect, test } from "bun:test";
import { AgentDatabase } from "../../src/infrastructure/database";
import { Logger } from "../../src/infrastructure/logger";
import { processQueue } from "../../src/runtime/queue";
import type { HostContext } from "../../src/runtime/context";
import type { Settings } from "../../src/types";
import {
  cleanupDatabaseDirs,
  makeDb,
  required,
  workspace,
} from "../support/database";

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
  await processQueue(makeContext(db, graph), required(item));
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
    stream: () => Promise.reject(new Error("boom")),
  };

  await processQueue(makeContext(db, graph), required(item));

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

  await processQueue(makeContext(db, {}), required(item));

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
  context.controller.abort();

  await processQueue(context, required(item));

  expect(db.control("123")).toBe("pause");
  expect(db.nextQueue("123")?.status).toBe("paused");
  db.close();
});

test("host abort cancels an active graph stream", async () => {
  const db = makeDb();
  db.resetSession("123", workspace);
  db.appendUser("123", "生成中的输入");
  const item = required(db.nextQueue("123"));
  const started = Promise.withResolvers<undefined>();
  const graph = {
    stream: (_input: unknown, options: { signal: AbortSignal }) => {
      started.resolve(undefined);
      return new Promise((_, reject) => {
        options.signal.addEventListener(
          "abort",
          () => {
            reject(
              options.signal.reason instanceof Error
                ? options.signal.reason
                : new Error("graph stream aborted"),
            );
          },
          { once: true },
        );
      });
    },
  };
  const context = makeContext(db, graph);
  const processing = processQueue(context, item);
  await started.promise;

  context.controller.abort(new Error("test stop"));
  await processing;

  expect(db.nextQueue("123")?.status).toBe("paused");
  db.close();
});

function makeContext(db: AgentDatabase, graph: unknown): HostContext {
  return {
    settings: makeSettings(),
    logger: new Logger("error"),
    db,
    graph: graph as HostContext["graph"],
    checkpointer: new MemorySaver() as unknown as HostContext["checkpointer"],
    hooks: {
      identity: { last: () => undefined },
      runSilentChain: () => Promise.resolve(),
    } as never,
    beforeModelNode: "model_request",
    sessionId: "123",
    controller: new AbortController(),
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
    leases: { hostTtlMs: 30_000, hookTtlMs: 30_000 },
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
