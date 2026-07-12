import { AIMessage, HumanMessage, ToolMessage } from "@langchain/core/messages";
import { ChatOpenAICompletions } from "@langchain/openai";
import { expect, test } from "bun:test";
import { modelMessages } from "../../src/agent/model";
import { configureFreeformMcpTools } from "../../src/infrastructure/mcpSupport/freeformToolInputs";
import { CompatibleChatOpenAIResponses } from "../../src/infrastructure/responses";
import {
  cacheTestCleanup,
  imageToolOutput,
  lookupTool,
  mockCompletions,
  mockResponses,
  persist,
  requiredArray,
  responsesCustomCall,
  responsesFunctionCall,
} from "../support/cache";
import { testSettings } from "../support/settings";

cacheTestCleanup();

test("Completions 请求在追加历史和 SQLite 恢复后保持缓存前缀", async () => {
  const requests: Record<string, unknown>[] = [];
  const server = mockCompletions(requests);
  const settings = testSettings("data");
  settings.agent.systemPrompt = "stable system";
  settings.model.baseURL = `${server.url}v1`;
  const tool = lookupTool();
  const model = new ChatOpenAICompletions({
    model: "test",
    apiKey: "test",
    streaming: false,
    configuration: { baseURL: settings.model.baseURL },
  }).bindTools([tool]);
  const initial = [new HumanMessage({ id: "user-1", content: "inspect" })];
  const history = [
    ...initial,
    new AIMessage({
      id: "assistant-1",
      content: "",
      tool_calls: [{ id: "call-1", name: "lookup", args: { query: "cache" } }],
    }),
    imageToolOutput(),
    new AIMessage({ id: "assistant-2", content: "first answer" }),
    new HumanMessage({ id: "user-2", content: "continue" }),
  ];

  await model.invoke(modelMessages(settings, "stable skills", initial));
  await model.invoke(modelMessages(settings, "stable skills", history));
  await model.invoke(
    modelMessages(settings, "stable skills", persist(history)),
  );

  const first = requiredArray(requests[0]?.["messages"]);
  const second = requiredArray(requests[1]?.["messages"]);
  const restored = requiredArray(requests[2]?.["messages"]);
  expect(second.slice(0, first.length)).toEqual(first);
  expect(restored).toEqual(second);
  expect(requests[2]?.["tools"]).toEqual(requests[1]?.["tools"]);
});

test("Responses 请求的 instructions、tools 和 input 保持缓存前缀", async () => {
  const requests: Record<string, unknown>[] = [];
  const server = mockResponses(requests);
  const settings = testSettings("data");
  settings.model.api = "responses";
  settings.agent.systemPrompt = "stable system";
  const configured = configureFreeformMcpTools([lookupTool()], ["lookup"]);
  const model = new CompatibleChatOpenAIResponses({
    model: "test",
    apiKey: "test",
    streaming: false,
    modelKwargs: { instructions: "stable system\n\nstable skills" },
    configuration: { baseURL: `${server.url}v1` },
  }).bindTools(configured.modelTools);
  const initial = [new HumanMessage({ id: "user-1", content: "inspect" })];
  const history = [
    ...initial,
    responsesFunctionCall(),
    imageToolOutput(),
    responsesCustomCall(),
    new ToolMessage({
      id: "custom-output",
      tool_call_id: "custom-1",
      content: "patched",
      additional_kwargs: { customTool: true },
    }),
    new HumanMessage({ id: "user-2", content: "continue" }),
  ];

  await model.invoke(modelMessages(settings, null, initial));
  await model.invoke(modelMessages(settings, null, history));
  await model.invoke(modelMessages(settings, null, persist(history)));

  const [first, second, restored] = requests;
  const firstInput = requiredArray(first?.["input"]);
  const secondInput = requiredArray(second?.["input"]);
  expect(secondInput.slice(0, firstInput.length)).toEqual(firstInput);
  expect(restored?.["input"]).toEqual(second?.["input"]);
  expect(restored?.["instructions"]).toBe(second?.["instructions"]);
  expect(restored?.["tools"]).toEqual(second?.["tools"]);
});
