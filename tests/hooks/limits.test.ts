import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AIMessage } from "@langchain/core/messages";
import { fakeModel } from "@langchain/core/testing";
import { tool } from "@langchain/core/tools";
import { MemorySaver } from "@langchain/langgraph-checkpoint";
import { z } from "zod";
import { expect, test } from "bun:test";
import { createAgentGraph } from "../../src/agent";
import { BunSqliteSaver } from "../../src/checkpointer";
import { HookRuntime } from "../../src/hooks/runtime";
import { consumeHookUsage } from "../../src/hooks/storage/usage";
import { AgentDatabase } from "../../src/infrastructure/database/agentDatabase";
import { Logger } from "../../src/infrastructure/logging/logger";
import type { HookRule } from "../../src/types";
import { testSettings } from "../support/settings";

test("runLimit is enforced atomically across graph threads", async () => {
  const dir = mkdtempSync(join(tmpdir(), "agent-hook-limits-"));
  const db = new AgentDatabase(join(dir, "app.sqlite"));
  db.createSession("session", dir);
  const calls: string[] = [];
  const disabled = makeTool("disabled", () => calls.push("disabled"));
  const limited = makeTool("limited", () => calls.push("limited"));
  const hooks = new HookRuntime(
    [silent("disabled", "disabled", 0), silent("limited", "limited", 2)],
    [disabled, limited],
    db.db,
    new Logger("error", true),
    "session",
    dir,
  );
  try {
    const graph = createAgentGraph({
      settings: testSettings(dir),
      model: fakeModel()
        .respond(new AIMessage("one"))
        .respond(new AIMessage("two"))
        .respond(new AIMessage("three")),
      tools: [disabled, limited],
      hooks,
      checkpointer: new MemorySaver(),
    });

    for (let index = 0; index < 3; index++) {
      await graph.invoke(
        {
          messages: [{ role: "user", content: "run" }],
          hookPendingUserIds: [`queue:${index.toString()}`],
        },
        { configurable: { thread_id: `thread:${index.toString()}` } },
      );
    }

    expect(calls).toEqual(["limited", "limited"]);
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("thread cleanup retains session hook usage", async () => {
  const dir = mkdtempSync(join(tmpdir(), "agent-hook-usage-"));
  const db = new AgentDatabase(join(dir, "app.sqlite"));
  db.createSession("session", dir);
  try {
    expect(consumeHookUsage(db.db, "session", "limited", 1)).toBeTrue();
    await new BunSqliteSaver(db.db, "session").deleteThread("thread:1");

    expect(consumeHookUsage(db.db, "session", "limited", 1)).toBeFalse();
    expect(
      db.db
        .query<{ used_count: number }, []>("SELECT used_count FROM hook_usage")
        .get()?.used_count,
    ).toBe(1);
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

function makeTool(name: string, record: () => void) {
  return tool(
    () => {
      record();
      return Promise.resolve(`${name}-result`);
    },
    { name, description: name, schema: z.object({}) },
  );
}

function silent(id: string, toolName: string, runLimit: number): HookRule {
  return {
    id,
    target: "agent",
    when: "before",
    runLimit,
    mode: "silent",
    tool: toolName,
    args: {},
  };
}
