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
import { HookLedger } from "../../src/hooks/ledger";
import { HookRuntime } from "../../src/hooks/runtime";
import { Logger } from "../../src/infrastructure/logger";
import type { HookRule } from "../../src/types";
import { testLeaseOptions } from "../support/leases";
import { testSettings } from "../support/settings";

test("runLimit is enforced atomically across graph threads", async () => {
  const dir = mkdtempSync(join(tmpdir(), "agent-hook-limits-"));
  const ledger = new HookLedger(join(dir, "hooks.sqlite"), testLeaseOptions);
  const calls: string[] = [];
  const disabled = makeTool("disabled", () => calls.push("disabled"));
  const limited = makeTool("limited", () => calls.push("limited"));
  const hooks = new HookRuntime(
    [silent("disabled", "disabled", 0), silent("limited", "limited", 2)],
    [disabled, limited],
    ledger,
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
    ledger.close();
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
