import { afterEach, expect, test } from "bun:test";
import { cleanupDatabaseDirs, makeDb, required, workspace } from "../support/database";
import { AIMessage } from "@langchain/core/messages";
import type { AgentDatabase } from "../../src/infrastructure/database/agentDatabase";
import type { HostContext } from "../../src/runtime/context";
import { Logger } from "../../src/infrastructure/logging/logger";
import { MemorySaver } from "@langchain/langgraph-checkpoint";
import type { Settings } from "../../src/types";
import { parseError } from "../../src/failures/details";
import { processQueue } from "../../src/runtime/queue";
afterEach(cleanupDatabaseDirs);
test("unexpected errors pause the queue", async () => {
  const db = makeDb();
  db.resetSession("123", workspace);
  db.appendUser("123", "会失败的输入");
  const item = db.nextQueue("123");
  const graph = {
    stream: () => Promise.reject(new Error("boom")),
  };
  const context = makeContext(db, graph);
  await processQueue(context, required(item));
  context.controller.abort();
  await processQueue(context, required(db.nextQueue("123")));
  expect(db.nextQueue("123")?.status).toBe("paused");
  expect(db.control("123")).toBe("pause");
  const stored = db.db.query<{ error: string }, []>("SELECT error FROM queue LIMIT 1").get();
  expect(parseError(required(stored).error)).toMatchObject({
    message: "boom",
    name: "Error",
  });
  db.close();
});
test("observer errors cannot revive a terminal queue", async () => {
  const db = makeDb();
  db.resetSession("123", workspace);
  db.appendUser("123", "会完成的输入");
  const item = required(db.nextQueue("123"));
  const final = new AIMessage({ content: "done", id: "final" });
  const graph = {
    getState: () =>
      Promise.resolve({
        next: [],
        tasks: [],
        values: {
          hookPlan: { finalMessageId: "final", kind: "done" },
          messages: [...db.history("123"), final],
        },
      }),
    stream: () => Promise.resolve([]),
  };
  const context = makeContext(db, graph);
  let changes = 0;
  context.observer = {
    changed: () => {
      if (++changes === 3) {
        throw new Error("observer failed");
      }
    },
    token: () => undefined,
  };
  let terminalError: unknown;
  try {
    await processQueue(context, item);
  } catch (error) {
    terminalError = error;
  }
  expect(terminalError).toMatchObject({ message: "observer failed" });
  expect(db.queueStatus(item.id)).toBe("done");
  expect(db.nextQueue("123")).toBeNull();
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
      const aborted = Promise.withResolvers<never>();
      options.signal.addEventListener(
        "abort",
        () => {
          aborted.reject(
            options.signal.reason instanceof Error
              ? options.signal.reason
              : new Error("graph stream aborted"),
          );
        },
        { once: true },
      );
      return aborted.promise;
    },
  };
  const context = makeContext(db, graph);
  const processing = processQueue(context, item);
  await started.promise;
  context.controller.abort(new Error("test stop"));
  await processing;
  expect(db.nextQueue("123")?.status).toBe("paused");
  expect(db.control("123")).toBe("pause");
  db.close();
});
function makeContext(db: AgentDatabase, graph: unknown): HostContext {
  return {
    checkpointer: new MemorySaver() as unknown as HostContext["checkpointer"],
    controller: new AbortController(),
    db,
    graph: graph as HostContext["graph"],
    logger: new Logger("error"),
    sessionId: "123",
    settings: makeSettings(),
  };
}
function makeSettings(): Settings {
  return {
    agent: { systemPrompt: "test" },
    attachments: { allowedSuffixes: [".txt"], maxSizeBytes: 1024 },
    frontend: {
      draftSaveDelayMs: 1,
      transcriptRefreshIntervalMs: 1,
    },
    hooks: [],
    host: {
      idleLogMs: 1,
      pausePollMs: 1,
      pollMs: 1,
      recursionLimit: 10,
      shutdownTimeoutMs: 1000,
    },
    leases: { hostTtlMs: 30_000 },
    logging: { level: "error", streamTokens: false },
    model: {
      adapter: "completions",
      apiKeyEnv: "TEST_OPENAI_KEY",
      baseURL: null,
      model: "test-model",
      temperature: 0,
      timeoutMs: 1000,
    },
    paths: { dataDir: "data" },
    skills: {
      directory: "~/.agents/skills",
      enabled: false,
      skillEnabled: {},
      usagePrompt: "use skills",
    },
    toolOutput: { maxTokens: 8192 },
  };
}
