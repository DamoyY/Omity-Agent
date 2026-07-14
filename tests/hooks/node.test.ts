import { AIMessage, type BaseMessage, ToolMessage } from "@langchain/core/messages";
import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { AgentDatabase } from "../../src/infrastructure/database/agentDatabase";
import type { HookRule } from "../../src/types";
import { HookRuntime } from "../../src/hooks/runtime";
import { Logger } from "../../src/infrastructure/logging/logger";
import { MemorySaver } from "@langchain/langgraph-checkpoint";
import { createAgentGraph } from "../../src/agent";
import { fakeModel } from "@langchain/core/testing";
import { isHookCallId } from "../../src/hooks/storage/calls";
import { join } from "node:path";
import { required } from "../support/database";
import { testSettings } from "../support/settings";
import { tmpdir } from "node:os";
import { tool } from "@langchain/core/tools";
import { z } from "zod";

const dirs: string[] = [];
const databases: AgentDatabase[] = [];
afterEach(() => {
  for (const db of databases.splice(0)) {
    db.close();
  }
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { force: true, recursive: true });
  }
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
    checkpointer: new MemorySaver(),
    hooks,
    model: fakeModel()
      .respond(
        new AIMessage({
          content: "",
          id: "agent-call-message",
          tool_calls: [{ args: {}, id: "original-call", name: "original" }],
        }),
      )
      .respond(new AIMessage("done")),
    settings: testSettings(hooks.workspace),
    tools: [hookTool, originalTool],
  });
  const result = await graph.invoke(
    { messages: [{ content: "run", role: "user" }] },
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
  const hookTool = makeTool("hook", () => calls.push(`call-${(calls.length + 1).toString()}`));
  const hooks = makeRuntime(
    [silent("first", "agent", "before"), silent("second", "agent", "before")],
    [hookTool],
  );
  const model = fakeModel().respond(new AIMessage("done"));
  const graph = createAgentGraph({
    checkpointer: new MemorySaver(),
    hooks,
    model,
    settings: testSettings(hooks.workspace),
    tools: [hookTool],
  });
  const config: NonNullable<Parameters<typeof graph.invoke>[1]> = {
    configurable: { thread_id: "boundaries" },
  };
  await invokeBoundary(
    graph,
    {
      hookPendingUserIds: ["queue:1"],
      messages: [{ content: "run", role: "user" }],
    },
    config,
  );
  expect(calls).toEqual(["call-1"]);
  expect(model.callCount).toBe(0);
  const state = await graph.getState(config);
  expect(state.next).toEqual(["hooks"]);
  await invokeBoundary(graph, null, config);
  expect(calls).toEqual(["call-1", "call-2"]);
  expect(model.callCount).toBe(0);
});
async function invokeBoundary(
  graph: ReturnType<typeof createAgentGraph>,
  input: Parameters<typeof graph.invoke>[0],
  config: NonNullable<Parameters<typeof graph.invoke>[1]>,
) {
  await invokeWithTaskInterrupt(graph, input, config);
  for (;;) {
    const state = await graph.getState(config);
    if (state.next.length > 0 || state.tasks.length === 0) {
      return;
    }
    await invokeWithTaskInterrupt(graph, null, config);
  }
}
async function invokeWithTaskInterrupt(
  graph: ReturnType<typeof createAgentGraph>,
  input: Parameters<typeof graph.invoke>[0],
  config: NonNullable<Parameters<typeof graph.invoke>[1]>,
) {
  const invoke: unknown = Reflect.get(graph, "invoke");
  if (typeof invoke !== "function") {
    throw new Error("LangGraph 缺少 invoke 方法");
  }
  await Reflect.apply(invoke, graph, [input, { ...config, interruptAfter: ["invoke_tool"] }]);
}
function makeRuntime(rules: HookRule[], tools: ReturnType<typeof makeTool>[]) {
  const dir = mkdtempSync(join(tmpdir(), "agent-hooks-"));
  dirs.push(dir);
  const db = new AgentDatabase(join(dir, "app.sqlite"));
  db.createSession("session", dir);
  databases.push(db);
  return new HookRuntime(rules, tools, db.db, new Logger("error", true), "session", dir);
}
function makeTool(name: string, record: () => void) {
  return tool(
    () => {
      record();
      return Promise.resolve(`${name}-result`);
    },
    { description: name, name, schema: z.object({}) },
  );
}
function takeover(id: string, target: string, when: HookRule["when"]): HookRule {
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
    args: {},
    id,
    mode: "silent",
    runLimit,
    target,
    tool: toolName,
    when,
  };
}
function assertToolProtocol(messages: BaseMessage[]) {
  for (const [index, message] of messages.entries()) {
    if (AIMessage.isInstance(message)) {
      for (const call of message.tool_calls ?? []) {
        const next = messages[index + 1];
        expect(next).toBeInstanceOf(ToolMessage);
        if (!ToolMessage.isInstance(next)) {
          throw new Error("工具调用后缺少 ToolMessage");
        }
        expect(next.tool_call_id).toBe(required(call.id));
      }
    }
  }
}
