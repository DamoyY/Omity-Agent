import { AIMessage, HumanMessage } from "@langchain/core/messages";
import { expect, test } from "bun:test";
import type { HookRuntime } from "../../src/hooks/runtime";
import { MemorySaver } from "@langchain/langgraph-checkpoint";
import { ModelEmptyResponseError } from "../../src/runtime/network";
import { createAgentGraph } from "../../src/agent";
import { fakeModel } from "@langchain/core/testing";
import { readGraphState } from "../../src/runtime/context";
import { testSettings } from "../support/settings";
test("rejects an empty model response before committing it", async () => {
  const model = fakeModel().respond(new AIMessage({ content: "", id: "empty" }));
  const graph = createAgentGraph({
    checkpointer: new MemorySaver(),
    hooks: { sessionId: "session" } as HookRuntime,
    model,
    settings: testSettings("data"),
    tools: [],
  });
  const config = { configurable: { thread_id: "empty-response" } };
  let failure: unknown;
  try {
    await graph.invoke({ messages: [{ content: "answer", role: "user" }] }, config);
  } catch (error) {
    failure = error;
  }
  expect(failure).toBeInstanceOf(ModelEmptyResponseError);
  expect(model.callCount).toBe(1);
  expect(
    readGraphState(await graph.getState(config)).values.messages.filter((message) =>
      AIMessage.isInstance(message),
    ),
  ).toHaveLength(0);
});
test("validates LangGraph state while retaining third-party task fields", () => {
  const message = new HumanMessage("question");
  const state = readGraphState({
    extension: true,
    next: ["model_request"],
    tasks: [{ id: "task-1", name: "model_request" }],
    values: { extension: true, hookPlan: { step: 1 }, messages: [message] },
  });
  expect(state.values.messages).toEqual([message]);
  expect(state.tasks[0]).toEqual({ id: "task-1", name: "model_request" });
  expect(() =>
    readGraphState({
      next: [],
      tasks: [],
      values: { hookPendingUserIds: [1], messages: [message] },
    }),
  ).toThrow("LangGraph Hook pending 状态无效");
});
