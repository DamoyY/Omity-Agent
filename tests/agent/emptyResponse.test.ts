import { AIMessage, HumanMessage } from "@langchain/core/messages";
import { fakeModel } from "@langchain/core/testing";
import { MemorySaver } from "@langchain/langgraph-checkpoint";
import { expect, test } from "bun:test";
import { createAgentGraph } from "../../src/agent";
import type { HookRuntime } from "../../src/hooks/runtime";
import { readGraphState } from "../../src/runtime/context";
import { ModelEmptyResponseError } from "../../src/runtime/network";
import { testSettings } from "../support/settings";

test("rejects an empty model response before committing it", async () => {
  const model = fakeModel().respond(new AIMessage({ id: "empty", content: "" }));
  const graph = createAgentGraph({
    settings: testSettings("data"),
    model,
    tools: [],
    hooks: { sessionId: "session" } as HookRuntime,
    checkpointer: new MemorySaver(),
  });
  const config = { configurable: { thread_id: "empty-response" } };

  let failure: unknown;
  try {
    await graph.invoke({ messages: [{ role: "user", content: "answer" }] }, config);
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
    values: { messages: [message], hookPlan: { step: 1 }, extension: true },
    next: ["model_request"],
    tasks: [{ name: "model_request", id: "task-1" }],
    extension: true,
  });

  expect(state.values.messages).toEqual([message]);
  expect(state.tasks[0]).toEqual({ name: "model_request", id: "task-1" });
  expect(() =>
    readGraphState({
      values: { messages: [message], hookPendingUserIds: [1] },
      next: [],
      tasks: [],
    }),
  ).toThrow("LangGraph Hook pending 状态无效");
});
