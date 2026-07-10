import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AIMessage } from "@langchain/core/messages";
import { fakeModel } from "@langchain/core/testing";
import { tool } from "@langchain/core/tools";
import { MemorySaver } from "@langchain/langgraph-checkpoint";
import { createAgent } from "langchain";
import { z } from "zod";
import { expect, test } from "bun:test";
import { HookLedger } from "../src/hooks/ledger";
import {
  createHookMiddleware,
  hookBeforeModelNode,
} from "../src/hooks/middleware";
import { HookRuntime } from "../src/hooks/runtime";
import { AgentDatabase } from "../src/infrastructure/database";
import { Logger } from "../src/infrastructure/logger";
import { processQueue } from "../src/runtime/queue";
import type { HostContext } from "../src/runtime/context";
import type { Settings } from "../src/types";

test("paused queue delays user hook until resume and runs it once", async () => {
  const dir = mkdtempSync(join(tmpdir(), "agent-hook-pause-"));
  const db = new AgentDatabase(join(dir, "app.sqlite"));
  const ledger = new HookLedger(join(dir, "hooks.sqlite"));
  let hookCalls = 0;
  try {
    db.createSession("session", dir);
    db.setControl("session", "pause");
    db.appendUser("session", "hello");
    const hookTool = tool(
      async () => {
        hookCalls++;
        return "ok";
      },
      { name: "hook", description: "hook", schema: z.object({}) },
    );
    const hooks = new HookRuntime(
      [
        {
          id: "user",
          on: "user_message",
          mode: "silent",
          tool: "hook",
          args: {},
        },
      ],
      [hookTool],
      ledger,
      new Logger("error", true),
      "session",
    );
    const graph = createAgent({
      model: fakeModel().respond(new AIMessage("done")),
      tools: [hookTool],
      middleware: [createHookMiddleware(hooks)],
      checkpointer: new MemorySaver(),
      version: "v1",
    });
    const context = makeContext(db, graph, hooks);
    const processing = processQueue(context, db.nextQueue("session")!);
    await Bun.sleep(30);
    expect(hookCalls).toBe(0);
    expect(db.nextQueue("session")?.userMessageId).toBeNull();
    db.setControl("session", "running");
    await processing;

    expect(hookCalls).toBe(1);
    expect(db.nextQueue("session")).toBeNull();
    expect(db.history("session").map((message) => message.text)).toEqual([
      "hello",
      "done",
    ]);
  } finally {
    ledger.close();
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

function makeContext(
  db: AgentDatabase,
  graph: unknown,
  hooks: HookRuntime,
): HostContext {
  return {
    settings: settings(),
    logger: new Logger("error", true),
    db,
    graph,
    checkpointer: new MemorySaver() as never,
    hooks,
    beforeModelNode: hookBeforeModelNode,
    sessionId: "session",
    signal: { stopping: false },
    wake: (delayMs) => Bun.sleep(delayMs),
  };
}

function settings(): Settings {
  return {
    paths: { dataDir: "data" },
    model: {
      provider: "openai-compatible",
      api: "completions",
      model: "test",
      apiKeyEnv: "TEST_KEY",
      baseURL: null,
      maxRetries: 0,
      timeoutMs: 1000,
    },
    host: { pollMs: 1, pausePollMs: 1, idleLogMs: 1, recursionLimit: 20 },
    logging: { level: "error", streamTokens: false },
    toolOutput: { maxTokens: 8192 },
    hooks: [],
    agent: { systemPrompt: "test" },
    skills: {
      enabled: false,
      directory: "skills",
      usagePrompt: "skills",
      skillEnabled: {},
    },
  };
}
