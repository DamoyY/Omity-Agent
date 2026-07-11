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
import { createHookMiddleware } from "../src/hooks/middleware";
import { HookRuntime } from "../src/hooks/runtime";
import { Logger } from "../src/infrastructure/logger";
import type { HookRule } from "../src/types";

test("mixed hook modes resolve variables in config order", async () => {
  const dir = mkdtempSync(join(tmpdir(), "agent-hook-variables-"));
  const ledger = new HookLedger(join(dir, "hooks.sqlite"));
  const received: Record<string, unknown>[] = [];
  const hookTool = tool(
    async (args) => {
      received.push(args);
      return `${args.label}-result`;
    },
    {
      name: "hook",
      description: "hook",
      schema: z
        .object({
          label: z.string(),
          cwd: z.string().optional(),
          previous: z.unknown().optional(),
          nested: z.array(z.unknown()).optional(),
        })
        .strict(),
    },
  );
  const originalTool = tool(async () => "original-result", {
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
    const agent = createAgent({
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
      middleware: [createHookMiddleware(hooks)],
      checkpointer: new MemorySaver(),
    });

    await agent.invoke(
      { messages: [{ role: "user", content: "run" }] },
      { configurable: { thread_id: "thread" } },
    );
    await hooks.runSilentChain("agent_end", "answer", "thread");

    expect(received).toEqual([
      { label: "before-silent", cwd: dir, nested: [`work:${dir}`] },
      { label: "before-takeover", previous: "before-silent-result" },
      { label: "after-silent", previous: "original-result" },
      { label: "after-takeover", previous: "after-silent-result" },
      { label: "agent-end", previous: "after-takeover-result" },
    ]);
  } finally {
    ledger.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("user takeover receives the preceding silent hook output", async () => {
  const dir = mkdtempSync(join(tmpdir(), "agent-user-hook-"));
  const ledger = new HookLedger(join(dir, "hooks.sqlite"));
  const received: unknown[] = [];
  const hookTool = tool(
    async ({ previous }) => {
      received.push(previous);
      return "user-hook-result";
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
        on: "user_message",
        mode: "silent",
        tool: "hook",
        args: {},
      },
      {
        id: "takeover-user",
        on: "user_message",
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
    const agent = createAgent({
      model: fakeModel().respond(new AIMessage("done")),
      tools: [hookTool],
      middleware: [createHookMiddleware(hooks)],
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
    hook("before-silent", "tool_before", "silent", {
      label: "before-silent",
      cwd: "${cwd}",
      nested: ["work:${cwd}"],
    }),
    hook("before-takeover", "tool_before", "takeover", {
      label: "before-takeover",
      previous: "${previousTool.output}",
    }),
    hook("after-silent", "tool_after", "silent", {
      label: "after-silent",
      previous: "${previousTool.output}",
    }),
    hook("after-takeover", "tool_after", "takeover", {
      label: "after-takeover",
      previous: "${previousTool.output}",
    }),
    {
      id: "agent-end",
      on: "agent_end",
      mode: "silent",
      tool: "hook",
      args: {
        label: "agent-end",
        previous: "${previousTool.output}",
      },
    },
  ];
}

function hook(
  id: string,
  on: "tool_before" | "tool_after",
  mode: "silent" | "takeover",
  args: Record<string, unknown>,
): HookRule {
  return { id, on, mode, args, tool: "hook", matchTool: "original" };
}
