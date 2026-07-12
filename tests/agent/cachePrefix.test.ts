import { AIMessage, HumanMessage } from "@langchain/core/messages";
import { ChatOpenAICompletions } from "@langchain/openai";
import { expect, test } from "bun:test";
import { modelMessages } from "../../src/agent/model";
import { configureFreeformMcpTools } from "../../src/infrastructure/mcp/freeformInputs";
import { CompatibleChatOpenAIResponses } from "../../src/infrastructure/openai/compatibleResponses";
import {
  cacheTestCleanup,
  imageToolOutput,
  lookupTool,
  mockCompletions,
  mockResponses,
  persist,
  requiredArray,
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

test("Responses HTTP 请求保留完整历史和稳定缓存键", async () => {
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
    promptCacheKey: "session-1",
    modelKwargs: { instructions: "stable system\n\nstable skills" },
    configuration: { baseURL: `${server.url}v1` },
  }).bindTools(configured.modelTools);
  const initial = [new HumanMessage({ id: "user-1", content: "inspect" })];
  const firstResponse = await model.invoke(
    modelMessages(settings, null, initial),
  );
  const secondHistory = [
    ...initial,
    firstResponse,
    new HumanMessage({ id: "user-2", content: "continue" }),
  ];
  const secondResponse = await model.invoke(
    modelMessages(settings, null, secondHistory),
  );
  const thirdHistory = persist([
    ...secondHistory,
    secondResponse,
    new HumanMessage({ id: "user-3", content: "persisted" }),
  ]);
  const thirdResponse = await model.invoke(
    modelMessages(settings, null, thirdHistory),
  );
  expect(thirdResponse.text).toBe("ok");

  const [first, second, third] = requests;
  const firstInput = requiredArray(first?.["input"]);
  const secondInput = requiredArray(second?.["input"]);
  const thirdInput = requiredArray(third?.["input"]);
  expect(first?.["prompt_cache_key"]).toBe("session-1");
  expect(second?.["prompt_cache_key"]).toBe("session-1");
  expect(third?.["prompt_cache_key"]).toBe("session-1");
  expect(second?.["previous_response_id"]).toBeUndefined();
  expect(third?.["previous_response_id"]).toBeUndefined();
  expect(secondInput.slice(0, firstInput.length)).toEqual(firstInput);
  expect(thirdInput.slice(0, secondInput.length)).toEqual(secondInput);
  expect(third?.["instructions"]).toBe(first?.["instructions"]);
  expect(third?.["tools"]).toEqual(first?.["tools"]);
});
