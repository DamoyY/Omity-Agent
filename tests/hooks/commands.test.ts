import { AIMessage } from "@langchain/core/messages";
import { expect, test } from "bun:test";
import { originalToolCommand } from "../../src/hooks/graph/commands";
import { restoreOriginal, toolPlan, type ToolHookPlan } from "../../src/hooks/plan";
import { messageReasoning } from "../../src/runtime/content";

test("parallel tool messages own response and provider metadata exactly once", () => {
  const original = responseWithParallelCalls();
  let plan = toolPlan(original);
  const messages: AIMessage[] = [];
  const calls = required(original.tool_calls);

  for (const [toolIndex, call] of calls.entries()) {
    const command = originalToolCommand({ ...plan, toolIndex }, original, call);
    const update = command.update as {
      messages: AIMessage[];
      hookPlan: ToolHookPlan;
    };
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
          type: "reasoning",
          summary: [{ type: "summary_text", text: "**Plan once**" }],
        },
        { type: "function_call", call_id: "call-1" },
      ],
    },
    { output: [{ type: "function_call", call_id: "call-2" }] },
    { output: [{ type: "function_call", call_id: "call-3" }] },
  ]);
  expect(messages.map((message) => message.additional_kwargs)).toEqual([
    {
      reasoning: original.additional_kwargs["reasoning"],
      trace: { request: "request-1" },
      __openai_function_call_ids__: {
        provider: "openai",
        "call-1": "fc-1",
      },
      tool_outputs: [{ id: "ct-1", type: "custom_tool_call", call_id: "call-1" }],
    },
    {
      __openai_function_call_ids__: { "call-2": "fc-2" },
      tool_outputs: [{ id: "ct-2", type: "custom_tool_call", call_id: "call-2" }],
    },
    {
      __openai_function_call_ids__: { "call-3": "fc-3" },
      tool_outputs: [{ id: "ct-3", type: "custom_tool_call", call_id: "call-3" }],
    },
  ]);
  expect(restoreOriginal(plan.original)).toEqual(original);
});

function responseWithParallelCalls() {
  return new AIMessage({
    id: "response-1",
    content: [
      { type: "reasoning", reasoning: "**Plan once**" },
      { type: "text", text: "Working" },
    ],
    tool_calls: [
      { id: "call-1", name: "first", args: {} },
      { id: "call-2", name: "second", args: {} },
      { id: "call-3", name: "third", args: {} },
    ],
    additional_kwargs: {
      reasoning: {
        id: "reasoning-1",
        type: "reasoning",
        summary: [{ type: "summary_text", text: "**Plan once**" }],
      },
      trace: { request: "request-1" },
      __openai_function_call_ids__: {
        provider: "openai",
        "call-1": "fc-1",
        "call-2": "fc-2",
        "call-3": "fc-3",
      },
      tool_outputs: [
        { id: "ct-1", type: "custom_tool_call", call_id: "call-1" },
        { id: "ct-2", type: "custom_tool_call", call_id: "call-2" },
        { id: "ct-3", type: "custom_tool_call", call_id: "call-3" },
      ],
    },
    response_metadata: {
      id: "response-1",
      model_provider: "openai",
      output: [
        {
          id: "reasoning-1",
          type: "reasoning",
          summary: [{ type: "summary_text", text: "**Plan once**" }],
        },
        { type: "function_call", call_id: "call-1" },
        { type: "function_call", call_id: "call-2" },
        { type: "function_call", call_id: "call-3" },
      ],
    },
    usage_metadata: {
      input_tokens: 10,
      output_tokens: 5,
      total_tokens: 15,
    },
  });
}

function required<T>(value: T | undefined): T {
  if (value === undefined) throw new Error("测试消息缺失");
  return value;
}
