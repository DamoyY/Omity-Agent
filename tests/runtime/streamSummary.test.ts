import { createStreamLogState, incrementalSummary } from "../../src/runtime/stream";
import { expect, test } from "bun:test";
test("stream debug logging keeps only incremental context", () => {
  const state = createStreamLogState();
  const first = {
    values: {
      messages: [
        { content: "第一条", id: "user-1" },
        { content: "中间响应", id: "ai-1" },
      ],
    },
  };
  const second = {
    values: {
      messages: [
        { content: "第一条", id: "user-1" },
        { content: "中间响应", id: "ai-1" },
        { content: "第二条", id: "user-2" },
      ],
    },
  };
  expect(incrementalSummary(first, state)).toEqual(first);
  expect(incrementalSummary(second, state)).toEqual({
    values: {
      messages: [{ content: "第二条", id: "user-2" }],
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
      count: 1,
      enabled: true,
      items: [null, "value", { first: 1, second: 2 }],
    },
  };
  expect(incrementalSummary(first, state)).toEqual(first);
  expect(incrementalSummary(reordered, state)).toBeUndefined();
});
