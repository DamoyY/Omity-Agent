import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  AIMessage,
  ToolMessage,
  type BaseMessage,
} from "@langchain/core/messages";
import { fakeModel } from "@langchain/core/testing";
import { tool } from "@langchain/core/tools";
import { MemorySaver } from "@langchain/langgraph-checkpoint";
import { z } from "zod";
import { afterEach, expect, test } from "bun:test";
import { createAgentGraph } from "../../src/agent";
import { HookLedger } from "../../src/hooks/ledger";
import { HookRuntime } from "../../src/hooks/runtime";
import { isHookCallId } from "../../src/hooks/storage/calls";
import { AgentDatabase } from "../../src/infrastructure/database";
import { Logger } from "../../src/infrastructure/logger";
import type { HookRule } from "../../src/types";
import { required } from "../support/database";
import { testLeaseOptions } from "../support/leases";
import { testSettings } from "../support/settings";

const dirs: string[] = [];
const databases: AgentDatabase[] = [];

afterEach(() => {
  for (const db of databases.splice(0)) db.close();
  for (const dir of dirs.splice(0))
    rmSync(dir, { recursive: true, force: true });
});

test("takeover hooks bracket an agent tool without recursive hooks", async () => {
  const calls: string[] = [];
  const hookTool = makeTool("hook", () => calls.push("hook"));
  const originalTool = makeTool("original", () => calls.push("original"));
  const hooks = makeRuntime(
    [
      silent("silent-before", "original", "before"),
      takeover("before", "original", "before"),
      takeover("after", "original", "after"),
      silent("must-not-run", "hook", "before"),
    ],
    [hookTool, originalTool],
  );
  const graph = createAgentGraph({
    settings: testSettings(hooks.workspace),
    model: fakeModel()
      .respond(
        new AIMessage({
          id: "agent-call-message",
          content: "",
          tool_calls: [{ id: "original-call", name: "original", args: {} }],
        }),
      )
      .respond(new AIMessage("done")),
    tools: [hookTool, originalTool],
    hooks,
    checkpointer: new MemorySaver(),
  });

  const result = await graph.invoke(
    { messages: [{ role: "user", content: "run" }] },
    { configurable: { thread_id: "thread" } },
  );

  expect(calls).toEqual(["hook", "hook", "original", "hook"]);
  const hookCallIds = result.messages
    .filter((message) => AIMessage.isInstance(message))
    .flatMap((message) => message.tool_calls ?? [])
    .map((call) => call.id)
    .filter(isHookCallId);
  expect(hookCallIds).toHaveLength(2);
  expect(hookCallIds.every((id) => id.length <= 64)).toBeTrue();
  expect(result.messages.map((message) => message.type)).toEqual([
    "human",
    "ai",
    "tool",
    "ai",
    "tool",
    "ai",
    "tool",
    "ai",
  ]);
  assertToolProtocol(result.messages);
});

test("each hook execution commits one hooks node boundary", async () => {
  const calls: string[] = [];
  const hookTool = makeTool("hook", () =>
    calls.push(`call-${(calls.length + 1).toString()}`),
  );
  const hooks = makeRuntime(
    [silent("first", "agent", "before"), silent("second", "agent", "before")],
    [hookTool],
  );
  const model = fakeModel().respond(new AIMessage("done"));
  const graph = createAgentGraph({
    settings: testSettings(hooks.workspace),
    model,
    tools: [hookTool],
    hooks,
    checkpointer: new MemorySaver(),
  });
  const config = {
    configurable: { thread_id: "boundaries" },
    interruptAfter: ["hooks"] as ["hooks"],
  };

  await graph.invoke(
    {
      messages: [{ role: "user", content: "run" }],
      hookPendingUserIds: ["queue:1"],
    },
    config,
  );
  expect(calls).toEqual(["call-1"]);
  expect(model.callCount).toBe(0);
  expect((await graph.getState(config)).next).toEqual(["hooks"]);

  await graph.invoke(null, config);
  expect(calls).toEqual(["call-1", "call-2"]);
  expect(model.callCount).toBe(0);
});

function makeRuntime(rules: HookRule[], tools: ReturnType<typeof makeTool>[]) {
  const dir = mkdtempSync(join(tmpdir(), "agent-hooks-"));
  dirs.push(dir);
  const db = new AgentDatabase(join(dir, "app.sqlite"));
  db.createSession("session", dir);
  databases.push(db);
  const ledger = new HookLedger(db.db, testLeaseOptions);
  return new HookRuntime(
    rules,
    tools,
    ledger,
    new Logger("error", true),
    "session",
    dir,
  );
}

function makeTool(name: string, record: () => void) {
  return tool(
    () => {
      record();
      return Promise.resolve(`${name}-result`);
    },
    { name, description: name, schema: z.object({}) },
  );
}

function takeover(
  id: string,
  target: string,
  when: HookRule["when"],
): HookRule {
  return { ...silent(id, target, when), mode: "takeover" };
}

function silent(
  id: string,
  target: string,
  when: HookRule["when"],
  toolName = "hook",
  runLimit = -1,
): HookRule {
  return {
    id,
    target,
    when,
    runLimit,
    mode: "silent",
    tool: toolName,
    args: {},
  };
}

function assertToolProtocol(messages: BaseMessage[]) {
  for (const [index, message] of messages.entries()) {
    if (!AIMessage.isInstance(message)) continue;
    for (const call of message.tool_calls ?? []) {
      const next = messages[index + 1];
      expect(next).toBeInstanceOf(ToolMessage);
      expect((next as ToolMessage).tool_call_id).toBe(required(call.id));
    }
  }
}
