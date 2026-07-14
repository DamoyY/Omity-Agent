import { expect, test } from "bun:test";
import { AIMessage } from "@langchain/core/messages";
import { AgentDatabase } from "../../src/infrastructure/database/agentDatabase";
import type { HookRule } from "../../src/types";
import { HookRuntime } from "../../src/hooks/runtime";
import { Logger } from "../../src/infrastructure/logging/logger";
import { MemorySaver } from "@langchain/langgraph-checkpoint";
import { createAgentGraph } from "../../src/agent";
import { createTestDirectory } from "../support/artifacts";
import { fakeModel } from "@langchain/core/testing";
import { join } from "node:path";
import { rmSync } from "node:fs";
import { testSettings } from "../support/settings";
import { tool } from "@langchain/core/tools";
import { z } from "zod";

test("mixed hook modes resolve variables in config order", async () => {
  const dir = createTestDirectory("hook-variables");
  const db = new AgentDatabase(join(dir, "app.sqlite"));
  db.createSession("session", dir);
  const received: Record<string, unknown>[] = [];
  const hookTool = tool(
    (args) => {
      received.push(args);
      return Promise.resolve(`${args.label}-result`);
    },
    {
      description: "hook",
      name: "hook",
      schema: z
        .object({
          label: z.string(),
          previous: z.unknown().optional(),
        })
        .strict(),
    },
  );
  const originalTool = tool(() => Promise.resolve("original-result"), {
    description: "original",
    name: "original",
    schema: z.object({}),
  });
  const hooks = new HookRuntime(
    rules(),
    [hookTool, originalTool],
    db.db,
    new Logger("error", true),
    "session",
    dir,
  );
  try {
    const agent = createAgentGraph({
      checkpointer: new MemorySaver(),
      hooks,
      model: fakeModel()
        .respond(
          new AIMessage({
            content: "",
            id: "model-tools",
            tool_calls: [{ args: {}, id: "original-call", name: "original" }],
          }),
        )
        .respond(new AIMessage("done")),
      settings: testSettings(dir),
      tools: [hookTool, originalTool],
    });
    const result = await agent.invoke(
      { messages: [{ content: "run", role: "user" }] },
      { configurable: { thread_id: "thread" } },
    );
    expect(received).toEqual([
      { label: "before-silent" },
      { label: "before-takeover", previous: "before-silent-result" },
      { label: "after-silent", previous: "original-result" },
      { label: "after-takeover", previous: "after-silent-result" },
      { label: "agent-end", previous: "after-takeover-result" },
    ]);
    expect(result.messages.slice(-2).map((message) => message.type)).toEqual(["ai", "tool"]);
  } finally {
    db.close();
    rmSync(dir, { force: true, recursive: true });
  }
});
test("user takeover receives the preceding silent hook output", async () => {
  const dir = createTestDirectory("user-hook");
  const db = new AgentDatabase(join(dir, "app.sqlite"));
  db.createSession("session", dir);
  const received: unknown[] = [];
  const hookTool = tool(
    ({ previous }) => {
      received.push(previous);
      return Promise.resolve("user-hook-result");
    },
    {
      description: "hook",
      name: "hook",
      schema: z.object({ previous: z.unknown().optional() }).strict(),
    },
  );
  const hooks = new HookRuntime(
    [
      {
        args: {},
        id: "silent-user",
        mode: "silent",
        runLimit: -1,
        target: "agent",
        tool: "hook",
        when: "before",
      },
      {
        args: { previous: `\${previousTool.output}` },
        id: "takeover-user",
        mode: "takeover",
        runLimit: -1,
        target: "agent",
        tool: "hook",
        when: "before",
      },
    ],
    [hookTool],
    db.db,
    new Logger("error", true),
    "session",
    dir,
  );
  try {
    const agent = createAgentGraph({
      checkpointer: new MemorySaver(),
      hooks,
      model: fakeModel().respond(new AIMessage("done")),
      settings: testSettings(dir),
      tools: [hookTool],
    });
    await agent.invoke(
      {
        hookPendingUserIds: ["queue:1"],
        messages: [{ content: "hello", role: "user" }],
      },
      { configurable: { thread_id: "thread" } },
    );
    expect(received).toEqual([undefined, "user-hook-result"]);
  } finally {
    db.close();
    rmSync(dir, { force: true, recursive: true });
  }
});
function rules(): HookRule[] {
  return [
    hookRule("before-silent", "before", "silent", {
      label: "before-silent",
    }),
    hookRule("before-takeover", "before", "takeover", {
      label: "before-takeover",
      previous: `\${previousTool.output}`,
    }),
    hookRule("after-silent", "after", "silent", {
      label: "after-silent",
      previous: `\${previousTool.output}`,
    }),
    hookRule("after-takeover", "after", "takeover", {
      label: "after-takeover",
      previous: `\${previousTool.output}`,
    }),
    hookRule(
      "agent-end",
      "after",
      "takeover",
      { label: "agent-end", previous: `\${previousTool.output}` },
      "agent",
    ),
  ];
}
function hookRule(
  id: string,
  when: HookRule["when"],
  mode: HookRule["mode"],
  args: Record<string, unknown>,
  target: HookRule["target"] = "original",
): HookRule {
  return {
    args,
    id,
    mode,
    runLimit: -1,
    target,
    tool: "hook",
    when,
  };
}
