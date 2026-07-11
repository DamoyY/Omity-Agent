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
import { HookLedger } from "../../src/hooks/ledger";
import {
  createHookMiddleware,
  hookBeforeModelNode,
} from "../../src/hooks/middleware";
import { HookRuntime } from "../../src/hooks/runtime";
import { AgentDatabase } from "../../src/infrastructure/database";
import { Logger } from "../../src/infrastructure/logger";
import { processQueue } from "../../src/runtime/queue";
import type { HostContext } from "../../src/runtime/context";
import type { Settings } from "../../src/types";
import { required } from "../support/database";

test("paused queue resumes one deterministic user hook chain", async () => {
  const dir = mkdtempSync(join(tmpdir(), "agent-hook-pause-"));
  const db = new AgentDatabase(join(dir, "app.sqlite"));
  const ledger = new HookLedger(join(dir, "hooks.sqlite"));
  let hookCalls = 0;
  const received: unknown[] = [];
  try {
    db.createSession("session", dir);
    db.setControl("session", "pause");
    db.appendUser("session", "hello");
    const hookTool = tool(
      ({ previous }) => {
        hookCalls++;
        received.push(previous);
        return Promise.resolve("ok");
      },
      {
        name: "hook",
        description: "hook",
        schema: z.object({ previous: z.unknown().optional() }).strict(),
      },
    );
    const hooks = new HookRuntime(
      [
        {
          id: "user-first",
          target: "agent",
          when: "before",
          runLimit: -1,
          mode: "silent",
          tool: "hook",
          args: {},
        },
        {
          id: "user-second",
          target: "agent",
          when: "before",
          runLimit: -1,
          mode: "silent",
          tool: "hook",
          args: { previous: "${previousTool.output}" },
        },
      ],
      [hookTool],
      ledger,
      new Logger("error", true),
      "session",
      dir,
    );
    const checkpointer = new MemorySaver();
    const graph = createAgent({
      model: fakeModel().respond(new AIMessage("done")),
      tools: [hookTool],
      middleware: [createHookMiddleware(hooks)],
      checkpointer,
      version: "v1",
    });
    const context = makeContext(db, graph, hooks, checkpointer);
    const processing = processQueue(context, required(db.nextQueue("session")));
    await Bun.sleep(30);
    expect(hookCalls).toBe(0);
    expect(db.nextQueue("session")?.userMessageId).toBeNull();
    db.setControl("session", "running");
    await processing;

    expect(hookCalls).toBe(2);
    expect(received).toEqual([undefined, "ok"]);
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

test("stale running hook invocation can be reclaimed after its lease", () => {
  const dir = mkdtempSync(join(tmpdir(), "agent-hook-lease-"));
  const path = join(dir, "hooks.sqlite");
  const details = {
    trigger: "agent:before",
    sourceId: "queue:1",
    hookId: "hook",
  };
  const first = new HookLedger(path, { leaseMs: 100, now: () => 1_000 });
  const active = new HookLedger(path, { leaseMs: 100, now: () => 1_050 });
  const recovered = new HookLedger(path, { leaseMs: 100, now: () => 1_101 });
  try {
    const claimed = first.claim("session", "thread", details, -1);
    const blocked = active.claim("session", "thread", details, -1);
    const reclaimed = recovered.claim("session", "thread", details, -1);

    expect(claimed.existing).toBeNull();
    expect(blocked.existing?.status).toBe("running");
    expect(() => {
      active.requireRunnable(required(blocked.existing), blocked.key);
    }).toThrow("状态不确定");
    expect(reclaimed.existing).toBeNull();
    expect(() => {
      first.fail(claimed.key, "late result");
    }).toThrow("Hook Lease 已丢失");
  } finally {
    first.close();
    active.close();
    recovered.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

function makeContext(
  db: AgentDatabase,
  graph: unknown,
  hooks: HookRuntime,
  checkpointer: MemorySaver,
): HostContext {
  return {
    settings: settings(),
    logger: new Logger("error", true),
    db,
    graph: graph as HostContext["graph"],
    checkpointer: checkpointer as never,
    hooks,
    beforeModelNode: hookBeforeModelNode,
    sessionId: "session",
    controller: new AbortController(),
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
