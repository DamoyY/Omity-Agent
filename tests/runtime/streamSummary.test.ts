import { expect, test } from "bun:test";
import { createStreamLogState, incrementalSummary } from "../../src/runtime/stream";
test("stream debug logging keeps only incremental context", () => {
  const state = createStreamLogState();
  const first = {
    values: {
      messages: [
        { id: "user-1", content: "第一条" },
        { id: "ai-1", content: "中间响应" },
      ],
    },
  };
  const second = {
    values: {
      messages: [
        { id: "user-1", content: "第一条" },
        { id: "ai-1", content: "中间响应" },
        { id: "user-2", content: "第二条" },
      ],
    },
  };
  expect(incrementalSummary(first, state)).toEqual(first);
  expect(incrementalSummary(second, state)).toEqual({
    values: {
      messages: [{ id: "user-2", content: "第二条" }],
    },
  });
  expect(incrementalSummary(second, state)).toBeUndefined();
});
test("stream update and debug events share one printed-information state", () => {
  const state = createStreamLogState();
  const update = { model_request: { messages: [{ content: "hello" }] } };
  const debug = { task: { input: { messages: [{ content: "hello" }] } } };
  expect(incrementalSummary(update, state)).toEqual(update);
  expect(incrementalSummary(debug, state)).toBeUndefined();
});
test("incremental summary accepts JSON values and compares object keys stably", () => {
  const state = createStreamLogState();
  const first = {
    payload: {
      count: 1,
      enabled: true,
      items: [null, "value", { first: 1, second: 2 }],
    },
  };
  const reordered = {
    payload: {
      items: [null, "value", { second: 2, first: 1 }],
      enabled: true,
      count: 1,
    },
  };
  expect(incrementalSummary(first, state)).toEqual(first);
  expect(incrementalSummary(reordered, state)).toBeUndefined();
});
