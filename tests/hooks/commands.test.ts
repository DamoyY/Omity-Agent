import { type ToolHookPlan, restoreOriginal, toolPlan } from "../../src/hooks/plan";
import { expect, test } from "bun:test";
import { AIMessage } from "@langchain/core/messages";
import { messageReasoning } from "../../src/runtime/content";
import { originalToolCommand } from "../../src/hooks/graph/commands";
test("parallel tool messages own response and provider metadata exactly once", () => {
  const original = responseWithParallelCalls();
  let plan = toolPlan(original);
  const messages: AIMessage[] = [];
  const calls = required(original.tool_calls);
  for (const [toolIndex, call] of calls.entries()) {
    const command = originalToolCommand({ ...plan, toolIndex }, original, call);
    const update = requireToolUpdate(command.update);
    messages.push(required(update.messages[0]));
    plan = update.hookPlan;
  }
  expect(messages.map((message) => required(message.tool_calls)[0]?.id)).toEqual([
    "call-1",
    "call-2",
    "call-3",
  ]);
  expect(messages.map((message) => messageReasoning(message))).toEqual(["**Plan once**", "", ""]);
  expect(messages.map((message) => message.content)).toEqual([original.content, "", ""]);
  expect(messages.map((message) => message.usage_metadata)).toEqual([
    original.usage_metadata,
    undefined,
    undefined,
  ]);
  expect(messages.map((message) => message.response_metadata)).toEqual([
    {
      id: "response-1",
      model_provider: "openai",
      output: [
        {
          id: "reasoning-1",
          summary: [{ text: "**Plan once**", type: "summary_text" }],
          type: "reasoning",
        },
        { call_id: "call-1", type: "function_call" },
      ],
    },
    { output: [{ call_id: "call-2", type: "function_call" }] },
    { output: [{ call_id: "call-3", type: "function_call" }] },
  ]);
  expect(messages.map((message) => message.additional_kwargs)).toEqual([
    {
      __openai_function_call_ids__: {
        "call-1": "fc-1",
        provider: "openai",
      },
      reasoning: original.additional_kwargs["reasoning"],
      tool_outputs: [{ call_id: "call-1", id: "ct-1", type: "custom_tool_call" }],
      trace: { request: "request-1" },
    },
    {
      __openai_function_call_ids__: { "call-2": "fc-2" },
      tool_outputs: [{ call_id: "call-2", id: "ct-2", type: "custom_tool_call" }],
    },
    {
      __openai_function_call_ids__: { "call-3": "fc-3" },
      tool_outputs: [{ call_id: "call-3", id: "ct-3", type: "custom_tool_call" }],
    },
  ]);
  expect(restoreOriginal(plan.original)).toEqual(original);
});
function responseWithParallelCalls() {
  return new AIMessage({
    additional_kwargs: {
      __openai_function_call_ids__: {
        "call-1": "fc-1",
        "call-2": "fc-2",
        "call-3": "fc-3",
        provider: "openai",
      },
      reasoning: {
        id: "reasoning-1",
        summary: [{ text: "**Plan once**", type: "summary_text" }],
        type: "reasoning",
      },
      tool_outputs: [
        { call_id: "call-1", id: "ct-1", type: "custom_tool_call" },
        { call_id: "call-2", id: "ct-2", type: "custom_tool_call" },
        { call_id: "call-3", id: "ct-3", type: "custom_tool_call" },
      ],
      trace: { request: "request-1" },
    },
    content: [
      { reasoning: "**Plan once**", type: "reasoning" },
      { text: "Working", type: "text" },
    ],
    id: "response-1",
    response_metadata: {
      id: "response-1",
      model_provider: "openai",
      output: [
        {
          id: "reasoning-1",
          summary: [{ text: "**Plan once**", type: "summary_text" }],
          type: "reasoning",
        },
        { call_id: "call-1", type: "function_call" },
        { call_id: "call-2", type: "function_call" },
        { call_id: "call-3", type: "function_call" },
      ],
    },
    tool_calls: [
      { args: {}, id: "call-1", name: "first" },
      { args: {}, id: "call-2", name: "second" },
      { args: {}, id: "call-3", name: "third" },
    ],
    usage_metadata: {
      input_tokens: 10,
      output_tokens: 5,
      total_tokens: 15,
    },
  });
}
function required<T>(value: T | undefined): T {
  if (value === undefined) {
    throw new Error("测试消息缺失");
  }
  return value;
}
function requireToolUpdate(value: unknown): { messages: AIMessage[]; hookPlan: ToolHookPlan } {
  if (
    !isRecord(value) ||
    !Array.isArray(value["messages"]) ||
    !value["messages"].every((message) => AIMessage.isInstance(message)) ||
    !isToolHookPlan(value["hookPlan"])
  ) {
    throw new Error("原始工具命令更新无效");
  }
  return { hookPlan: value["hookPlan"], messages: value["messages"] };
}
function isToolHookPlan(value: unknown): value is ToolHookPlan {
  return (
    isRecord(value) &&
    value["kind"] === "tools" &&
    isRecord(value["original"]) &&
    typeof value["toolIndex"] === "number" &&
    typeof value["hookIndex"] === "number" &&
    (value["stage"] === "before" || value["stage"] === "original" || value["stage"] === "after") &&
    typeof value["responseEmitted"] === "boolean"
  );
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
