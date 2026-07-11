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
import { createAgent } from "langchain";
import { z } from "zod";
import { afterEach, expect, test } from "bun:test";
import { createHookMiddleware } from "../src/hooks/middleware";
import { HookLedger } from "../src/hooks/ledger";
import { HookRuntime } from "../src/hooks/runtime";
import { isHookCallId } from "../src/hooks/storage/calls";
import { AgentDatabase } from "../src/infrastructure/database";
import { Logger } from "../src/infrastructure/logger";
import type { HookRule } from "../src/types";

const dirs: string[] = [];
const databases: AgentDatabase[] = [];
const ledgers: HookLedger[] = [];

afterEach(() => {
  for (const db of databases.splice(0)) db.close();
  for (const ledger of ledgers.splice(0)) ledger.close();
  for (const dir of dirs.splice(0))
    rmSync(dir, {
      recursive: true,
      force: true,
      maxRetries: 10,
      retryDelay: 50,
    });
});

test("takeover hooks bracket an agent tool without recursive hooks", async () => {
  const calls: string[] = [];
  const hookTool = makeTool("hook", () => calls.push("hook"));
  const originalTool = makeTool("original", () => calls.push("original"));
  const rules: HookRule[] = [
    takeover("before", "original", "before"),
    takeover("after", "original", "after"),
    silent("must-not-run", "hook", "before"),
  ];
  const hooks = makeRuntime(rules, [hookTool, originalTool]);
  const model = fakeModel()
    .respond(
      new AIMessage({
        id: "agent-call-message",
        content: "",
        tool_calls: [{ id: "original-call", name: "original", args: {} }],
      }),
    )
    .respond(new AIMessage("done"));
  const agent = createAgent({
    model,
    tools: [hookTool, originalTool],
    middleware: [createHookMiddleware(hooks)],
    checkpointer: new MemorySaver(),
  });

  const result = await agent.invoke(
    { messages: [{ role: "user", content: "run" }] },
    { configurable: { thread_id: "thread" } },
  );

  expect(calls).toEqual(["hook", "original", "hook"]);
  const hookCallIds = result.messages
    .filter((message) => message instanceof AIMessage)
    .flatMap((message) => message.tool_calls ?? [])
    .map((call) => call.id)
    .filter(isHookCallId);
  expect(hookCallIds.length).toBe(2);
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

test("silent hook is omitted from agent context and runs once", async () => {
  let hookCalls = 0;
  const hookTool = makeTool("hook", () => hookCalls++);
  const hooks = makeRuntime([silent("user", "agent", "before")], [hookTool]);
  await hooks.runSilentChain("agent", "before", "queue:1", "thread");
  await hooks.runSilentChain("agent", "before", "queue:1", "thread");

  expect(hookCalls).toBe(1);
  expect(invocations(hooks)).toEqual([
    { status: "done", trigger: "agent:before" },
  ]);
});

function makeRuntime(rules: HookRule[], tools: ReturnType<typeof makeTool>[]) {
  const dir = mkdtempSync(join(tmpdir(), "agent-hooks-"));
  dirs.push(dir);
  const db = new AgentDatabase(join(dir, "app.sqlite"));
  databases.push(db);
  db.createSession("session", dir);
  const ledger = new HookLedger(join(dir, "hooks.sqlite"));
  ledgers.push(ledger);
  const runtime = new HookRuntime(
    rules,
    tools,
    ledger,
    new Logger("error", true),
    "session",
    dir,
  );
  Object.assign(runtime, { testLedger: ledger });
  return runtime;
}

function makeTool(name: string, record: () => void) {
  return tool(
    async () => {
      record();
      return `${name}-result`;
    },
    { name, description: name, schema: z.object({}) },
  );
}

function takeover(
  id: string,
  target: string,
  when: HookRule["when"],
): HookRule {
  return { id, target, when, mode: "takeover", tool: "hook", args: {} };
}

function silent(id: string, target: string, when: HookRule["when"]): HookRule {
  return { id, target, when, mode: "silent", tool: "hook", args: {} };
}

function assertToolProtocol(messages: BaseMessage[]) {
  for (const [index, message] of messages.entries()) {
    if (!(message instanceof AIMessage)) continue;
    for (const call of message.tool_calls ?? []) {
      const next = messages[index + 1];
      expect(next).toBeInstanceOf(ToolMessage);
      expect((next as ToolMessage).tool_call_id).toBe(call.id!);
    }
  }
}

function invocations(runtime: HookRuntime) {
  return (
    runtime as HookRuntime & { testLedger: HookLedger }
  ).testLedger.rows();
}
