import { expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { AIMessage } from "@langchain/core/messages";
import { AgentDatabase } from "../../src/infrastructure/database/agentDatabase";
import { BunSqliteSaver } from "../../src/checkpointer";
import type { HookRule } from "../../src/types";
import { HookRuntime } from "../../src/hooks/runtime";
import { Logger } from "../../src/infrastructure/logging/logger";
import { MemorySaver } from "@langchain/langgraph-checkpoint";
import { consumeHookUsage } from "../../src/hooks/storage/usage";
import { createAgentGraph } from "../../src/agent";
import { fakeModel } from "@langchain/core/testing";
import { join } from "node:path";
import { testSettings } from "../support/settings";
import { tmpdir } from "node:os";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
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
      checkpointer: new MemorySaver(),
      hooks,
      model: fakeModel()
        .respond(new AIMessage("one"))
        .respond(new AIMessage("two"))
        .respond(new AIMessage("three")),
      settings: testSettings(dir),
      tools: [disabled, limited],
    });
    for (let index = 0; index < 3; index++) {
      await graph.invoke(
        {
          hookPendingUserIds: [`queue:${index.toString()}`],
          messages: [{ content: "run", role: "user" }],
        },
        { configurable: { thread_id: `thread:${index.toString()}` } },
      );
    }
    expect(calls).toEqual(["limited", "limited"]);
  } finally {
    db.close();
    rmSync(dir, { force: true, recursive: true });
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
      db.db.query<{ used_count: number }, []>("SELECT used_count FROM hook_usage").get()
        ?.used_count,
    ).toBe(1);
  } finally {
    db.close();
    rmSync(dir, { force: true, recursive: true });
  }
});
function makeTool(name: string, record: () => void) {
  return tool(
    () => {
      record();
      return Promise.resolve(`${name}-result`);
    },
    { description: name, name, schema: z.object({}) },
  );
}
function silent(id: string, toolName: string, runLimit: number): HookRule {
  return {
    args: {},
    id,
    mode: "silent",
    runLimit,
    target: "agent",
    tool: toolName,
    when: "before",
  };
}
