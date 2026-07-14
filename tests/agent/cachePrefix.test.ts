import { AIMessage, HumanMessage } from "@langchain/core/messages";
import { afterEach, expect, test } from "bun:test";
import {
  cleanupCacheTests,
  imageToolOutput,
  lookupTool,
  mockCompletions,
  mockResponses,
  persist,
  requiredArray,
} from "../support/cache";
import { ChatOpenAICompletions } from "@langchain/openai";
import { CompatibleChatOpenAIResponses } from "../../src/infrastructure/openai/compatibleResponses";
import { configureFreeformMcpTools } from "../../src/infrastructure/mcp/freeformInputs";
import { modelMessages } from "../../src/agent/model";
import { testSettings } from "../support/settings";

afterEach(cleanupCacheTests);
test("Completions 请求在追加历史和 SQLite 恢复后保持缓存前缀", async () => {
  const requests: Record<string, unknown>[] = [];
  const server = mockCompletions(requests);
  const settings = testSettings("data");
  settings.agent.systemPrompt = "stable system";
  settings.model.baseURL = `${server.url}v1`;
  const tool = lookupTool();
  const model = new ChatOpenAICompletions({
    apiKey: "test",
    configuration: { baseURL: settings.model.baseURL },
    model: "test",
    streaming: false,
  }).bindTools([tool]);
  const initial = [new HumanMessage({ content: "inspect", id: "user-1" })];
  const history = [
    ...initial,
    new AIMessage({
      content: "",
      id: "assistant-1",
      tool_calls: [{ args: { query: "cache" }, id: "call-1", name: "lookup" }],
    }),
    imageToolOutput(),
    new AIMessage({ content: "first answer", id: "assistant-2" }),
    new HumanMessage({ content: "continue", id: "user-2" }),
  ];
  await model.invoke(modelMessages(settings, "stable skills", initial));
  await model.invoke(modelMessages(settings, "stable skills", history));
  await model.invoke(modelMessages(settings, "stable skills", persist(history)));
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
  settings.model.adapter = "responses";
  settings.agent.systemPrompt = "stable system";
  const configured = configureFreeformMcpTools([lookupTool()], ["lookup"]);
  const model = new CompatibleChatOpenAIResponses({
    apiKey: "test",
    configuration: { baseURL: `${server.url}v1` },
    model: "test",
    modelKwargs: { instructions: "stable system\n\nstable skills" },
    promptCacheKey: "session-1",
    streaming: false,
  }).bindTools(configured.modelTools);
  const initial = [new HumanMessage({ content: "inspect", id: "user-1" })];
  const firstResponse = await model.invoke(modelMessages(settings, null, initial));
  const secondHistory = [
    ...initial,
    firstResponse,
    new HumanMessage({ content: "continue", id: "user-2" }),
  ];
  const secondResponse = await model.invoke(modelMessages(settings, null, secondHistory));
  const thirdHistory = persist([
    ...secondHistory,
    secondResponse,
    new HumanMessage({ content: "persisted", id: "user-3" }),
  ]);
  const thirdResponse = await model.invoke(modelMessages(settings, null, thirdHistory));
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
