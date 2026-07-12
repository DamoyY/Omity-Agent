import { AIMessage, HumanMessage } from "@langchain/core/messages";
import { ChatOpenAICompletions } from "@langchain/openai";
import { expect, test } from "bun:test";
import type { OpenAI } from "openai";
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

test("Responses 请求使用响应 ID 和严格增量 input 延续会话", async () => {
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
  const equalHistory = [...thirdHistory, thirdResponse];
  const fourthResponse = await model.invoke(
    modelMessages(settings, null, equalHistory),
  );
  await model.invoke(
    modelMessages(settings, null, [
      ...equalHistory,
      fourthResponse,
      new HumanMessage({ id: "user-4", content: "changed params" }),
    ]),
    { parallel_tool_calls: false },
  );

  const [first, second, third, equal, changedParams] = requests;
  expect(first?.["prompt_cache_key"]).toBe("session-1");
  expect(second?.["prompt_cache_key"]).toBe("session-1");
  expect(second?.["previous_response_id"]).toBe("response-1");
  expect(second?.["input"]).toEqual([
    { type: "message", role: "user", content: "continue" },
  ]);
  expect(third?.["previous_response_id"]).toBe("response-2");
  expect(third?.["input"]).toEqual([
    { type: "message", role: "user", content: "persisted" },
  ]);
  expect(equal?.["previous_response_id"]).toBeUndefined();
  expect(requiredArray(equal?.["input"]).length).toBeGreaterThan(1);
  expect(changedParams?.["previous_response_id"]).toBeUndefined();
  expect(requiredArray(changedParams?.["input"]).length).toBeGreaterThan(1);
  expect(changedParams?.["instructions"]).toBe(first?.["instructions"]);
  expect(changedParams?.["tools"]).toEqual(first?.["tools"]);
});

test("Responses 流式终态响应建立下一次请求的增量链", async () => {
  const requests: Record<string, unknown>[] = [];
  const server = mockResponses(requests);
  const model = new CompatibleChatOpenAIResponses({
    model: "test",
    apiKey: "test",
    streaming: true,
    promptCacheKey: "stream-session",
    configuration: { baseURL: `${server.url}v1` },
  });
  const firstInput: OpenAI.Responses.ResponseInput = [
    { type: "message", role: "user", content: "first" },
  ];
  const firstStream = await model.completionWithRetry({
    model: "test",
    input: firstInput,
    prompt_cache_key: "stream-session",
    stream: true,
  });
  let firstResponse: OpenAI.Responses.Response | undefined;
  for await (const event of firstStream) {
    if (event.type === "response.completed") firstResponse = event.response;
  }
  if (!firstResponse) throw new Error("流式响应缺少 completed 事件");
  const delta = { type: "message", role: "user", content: "second" } as const;
  const secondStream = await model.completionWithRetry({
    model: "test",
    input: [
      ...firstInput,
      ...(firstResponse.output as unknown as OpenAI.Responses.ResponseInput),
      delta,
    ],
    prompt_cache_key: "stream-session",
    stream: true,
  });
  let secondCompleted = false;
  for await (const event of secondStream) {
    if (event.type === "response.completed") secondCompleted = true;
  }

  expect(secondCompleted).toBeTrue();
  expect(requests[1]?.["previous_response_id"]).toBe("response-1");
  expect(requests[1]?.["input"]).toEqual([delta]);
});
