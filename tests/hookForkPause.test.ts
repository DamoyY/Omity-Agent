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
import { forkDatabaseBeforeMessage } from "../src/app/fork";
import { HookLedger } from "../src/hooks/ledger";
import {
  createHookMiddleware,
  hookBeforeModelNode,
} from "../src/hooks/middleware";
import { HookRuntime } from "../src/hooks/runtime";
import { AgentDatabase } from "../src/infrastructure/database";
import { Logger } from "../src/infrastructure/logger";
import type { HostContext } from "../src/runtime/context";
import { processQueue } from "../src/runtime/queue";
import type { Settings } from "../src/types";

test("forked appended message runs its hook once after resume", async () => {
  const dir = mkdtempSync(join(tmpdir(), "agent-hook-fork-"));
  const source = new AgentDatabase(join(dir, "source.sqlite"));
  const target = new AgentDatabase(join(dir, "target.sqlite"));
  const ledger = new HookLedger(join(dir, "hooks.sqlite"));
  const targetWorkspace = join(dir, "target-workspace");
  try {
    source.createSession("source", dir);
    const rootQueue = source.appendUser("source", "first");
    source.startQueue("source", source.nextQueue("source")!);
    source.appendAssistant("source", rootQueue, "first reply");
    const appendedQueue = source.appendUser("source", "second");
    source.startQueue("source", source.pendingAppends("source")[0]!);
    forkDatabaseBeforeMessage({
      source,
      target,
      sourceSessionId: "source",
      targetSessionId: "target",
      workspace: targetWorkspace,
      beforeMessageId: messageId(source, appendedQueue),
    });
    let hookCalls = 0;
    let hookWorkspace: string | undefined;
    const hookTool = tool(
      async ({ cwd }) => {
        hookCalls++;
        hookWorkspace = cwd;
        return "hooked";
      },
      {
        name: "hook",
        description: "hook",
        schema: z.object({ cwd: z.string() }).strict(),
      },
    );
    const hooks = new HookRuntime(
      [
        {
          id: "user",
          on: "user_message",
          mode: "silent",
          tool: "hook",
          args: { cwd: "${cwd}" },
        },
      ],
      [hookTool],
      ledger,
      new Logger("error", true),
      "target",
      target.workspace("target"),
    );
    const checkpointer = new MemorySaver();
    const graph = createAgent({
      model: fakeModel().respond(new AIMessage("fork reply")),
      tools: [hookTool],
      middleware: [createHookMiddleware(hooks)],
      checkpointer,
      version: "v1",
    });

    expect(target.control("target")).toBe("pause");
    target.setControl("target", "running");
    await processQueue(
      context(target, graph, hooks, checkpointer),
      target.nextQueue("target")!,
    );

    expect(hookCalls).toBe(1);
    expect(hookWorkspace).toBe(targetWorkspace);
    expect(target.history("target").map((message) => message.text)).toEqual([
      "first",
      "first reply",
      "second",
      "fork reply",
    ]);
    expect(source.control("source")).toBe("running");
  } finally {
    ledger.close();
    source.close();
    target.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

function messageId(db: AgentDatabase, queueId: number) {
  const query = db.db.prepare<{ id: number }, [number]>(
    "SELECT id FROM messages WHERE queue_id = ?",
  );
  try {
    return query.get(queueId)!.id;
  } finally {
    query.finalize();
  }
}

function context(
  db: AgentDatabase,
  graph: unknown,
  hooks: HookRuntime,
  checkpointer: MemorySaver,
): HostContext {
  return {
    settings: settings(),
    logger: new Logger("error", true),
    db,
    graph,
    checkpointer: checkpointer as never,
    hooks,
    beforeModelNode: hookBeforeModelNode,
    sessionId: "target",
    signal: { stopping: false },
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
