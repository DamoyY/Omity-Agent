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

test("mixed hook modes resolve variables in config order", async () => {
  const dir = mkdtempSync(join(tmpdir(), "agent-hook-variables-"));
  const ledger = new HookLedger(join(dir, "hooks.sqlite"), testLeaseOptions);
  const received: Record<string, unknown>[] = [];
  const hookTool = tool(
    (args) => {
      received.push(args);
      return Promise.resolve(`${args.label}-result`);
    },
    {
      name: "hook",
      description: "hook",
      schema: z
        .object({
          label: z.string(),
          previous: z.unknown().optional(),
        })
        .strict(),
    },
  );
  const originalTool = tool(() => Promise.resolve("original-result"), {
    name: "original",
    description: "original",
    schema: z.object({}),
  });
  const hooks = new HookRuntime(
    rules(),
    [hookTool, originalTool],
    ledger,
    new Logger("error", true),
    "session",
    dir,
  );
  try {
    const agent = createAgentGraph({
      settings: testSettings(dir),
      model: fakeModel()
        .respond(
          new AIMessage({
            id: "model-tools",
            content: "",
            tool_calls: [{ id: "original-call", name: "original", args: {} }],
          }),
        )
        .respond(new AIMessage("done")),
      tools: [hookTool, originalTool],
      hooks,
      checkpointer: new MemorySaver(),
    });

    const result = await agent.invoke(
      { messages: [{ role: "user", content: "run" }] },
      { configurable: { thread_id: "thread" } },
    );
    expect(received).toEqual([
      { label: "before-silent" },
      { label: "before-takeover", previous: "before-silent-result" },
      { label: "after-silent", previous: "original-result" },
      { label: "after-takeover", previous: "after-silent-result" },
      { label: "agent-end", previous: "after-takeover-result" },
    ]);
    expect(result.messages.slice(-2).map((message) => message.type)).toEqual([
      "ai",
      "tool",
    ]);
  } finally {
    ledger.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("user takeover receives the preceding silent hook output", async () => {
  const dir = mkdtempSync(join(tmpdir(), "agent-user-hook-"));
  const ledger = new HookLedger(join(dir, "hooks.sqlite"), testLeaseOptions);
  const received: unknown[] = [];
  const hookTool = tool(
    ({ previous }) => {
      received.push(previous);
      return Promise.resolve("user-hook-result");
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
        id: "silent-user",
        target: "agent",
        when: "before",
        runLimit: -1,
        mode: "silent",
        tool: "hook",
        args: {},
      },
      {
        id: "takeover-user",
        target: "agent",
        when: "before",
        runLimit: -1,
        mode: "takeover",
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
  try {
    const agent = createAgentGraph({
      settings: testSettings(dir),
      model: fakeModel().respond(new AIMessage("done")),
      tools: [hookTool],
      hooks,
      checkpointer: new MemorySaver(),
    });
    await agent.invoke(
      {
        messages: [{ role: "user", content: "hello" }],
        hookPendingUserIds: ["queue:1"],
      },
      { configurable: { thread_id: "thread" } },
    );
    expect(received).toEqual([undefined, "user-hook-result"]);
  } finally {
    ledger.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

function rules(): HookRule[] {
  return [
    hookRule("before-silent", "before", "silent", {
      label: "before-silent",
    }),
    hookRule("before-takeover", "before", "takeover", {
      label: "before-takeover",
      previous: "${previousTool.output}",
    }),
    hookRule("after-silent", "after", "silent", {
      label: "after-silent",
      previous: "${previousTool.output}",
    }),
    hookRule("after-takeover", "after", "takeover", {
      label: "after-takeover",
      previous: "${previousTool.output}",
    }),
    {
      id: "agent-end",
      target: "agent",
      when: "after",
      runLimit: -1,
      mode: "takeover",
      tool: "hook",
      args: {
        label: "agent-end",
        previous: "${previousTool.output}",
      },
    },
  ];
}

function hookRule(
  id: string,
  when: HookRule["when"],
  mode: HookRule["mode"],
  args: Record<string, unknown>,
): HookRule {
  return {
    id,
    target: "original",
    when,
    runLimit: -1,
    mode,
    args,
    tool: "hook",
  };
}
