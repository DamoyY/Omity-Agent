import type { DisplayEvent, DisplayMessage, DisplayQueue } from "../../../src/app/timeline";
import { expect, test } from "bun:test";
import { buildTimeline } from "../../../src/app/timeline";
test("streaming tool call is hidden after the final tool call is visible", () => {
  const messages: DisplayMessage[] = [
    {
      content: "",
      createdAt: 1,
      id: 1,
      images: [],
      queueId: null,
      reasoning: "",
      role: "assistant",
      sourceId: "message-1",
      toolCalls: [
        {
          id: "call-1",
          index: 0,
          input: {},
          inputTokens: 1,
          name: "terminal_new_tab",
        },
      ],
    },
  ];
  const queue: DisplayQueue[] = [{ content: "run", error: null, id: 1, status: "running" }];
  const events: DisplayEvent[] = [
    {
      id: 1,
      message: "tool_call",
      payload: {
        call: { id: "call-1", index: 0, name: "terminal_new_tab" },
        kind: "tool_call_delta",
        queueId: 1,
      },
    },
  ];
  const view = buildTimeline(messages, queue, events);
  expect(view).toHaveLength(1);
  expect(toolCalls(view[0])).toHaveLength(1);
  expect(toolCalls(view[0])[0]?.streaming).toBeUndefined();
});
test("streaming tool call is grouped with previous assistant message", () => {
  const messages: DisplayMessage[] = [
    {
      content: "",
      createdAt: 1,
      id: 1,
      images: [],
      queueId: null,
      reasoning: "",
      role: "assistant",
      sourceId: "message-1",
      toolCalls: [
        {
          id: "call-1",
          index: 0,
          input: {},
          inputTokens: 1,
          name: "terminal_new_tab",
        },
      ],
    },
  ];
  const queue: DisplayQueue[] = [{ content: "run", error: null, id: 1, status: "running" }];
  const events: DisplayEvent[] = [
    {
      id: 1,
      message: "tool_call",
      payload: {
        call: { id: "call-2", index: 1, name: "terminal_send_command" },
        kind: "tool_call_delta",
        queueId: 1,
      },
    },
  ];
  const view = buildTimeline(messages, queue, events);
  expect(view).toHaveLength(1);
  expect(toolCalls(view[0]).map((call) => call.id)).toEqual(["call-1", "call-2"]);
});
test("tool output retains images", () => {
  const image = {
    mimeType: "image/png",
    src: "data:image/png;base64,iVBORw0KGgo=",
  };
  const messages: DisplayMessage[] = [
    {
      content: "",
      createdAt: 1,
      id: 1,
      images: [],
      queueId: null,
      reasoning: "",
      role: "assistant",
      toolCalls: [{ id: "call-1", index: 0, input: {}, inputTokens: 1, name: "capture" }],
    },
    {
      content: "",
      createdAt: 2,
      id: 2,
      images: [image],
      queueId: null,
      reasoning: "",
      role: "tool",
      toolCallId: "call-1",
      toolCalls: [],
    },
  ];
  const view = buildTimeline(messages, [], []);
  const output = view[0]?.parts.find((part) => part.type === "tool")?.output;
  expect(output?.images).toEqual([image]);
});
test("started tool call exposes an empty output state", () => {
  const messages: DisplayMessage[] = [
    {
      content: "",
      createdAt: 1,
      id: 1,
      images: [],
      queueId: null,
      reasoning: "",
      role: "assistant",
      toolCalls: [{ id: "call-1", index: 0, input: {}, inputTokens: 1, name: "capture" }],
    },
  ];
  const events: DisplayEvent[] = [
    {
      id: 1,
      message: "tool_started",
      payload: { callId: "call-1", kind: "tool_started", queueId: 1 },
    },
  ];
  const part = buildTimeline(messages, [], events)[0]?.parts.find((item) => item.type === "tool");
  expect(part?.started).toBe(true);
  expect(part?.output).toBeUndefined();
});
test("grouped assistant messages retain the latest token usage", () => {
  const usage = {
    cacheReadTokens: 900,
    inputTokens: 1200,
    outputTokens: 300,
  };
  const messages: DisplayMessage[] = [
    assistant(1, {
      cacheReadTokens: 400,
      inputTokens: 800,
      outputTokens: 200,
    }),
    assistant(2, usage),
  ];
  const view = buildTimeline(messages, [], []);
  expect(view).toHaveLength(1);
  expect(view[0]?.usage).toEqual(usage);
});
function assistant(id: number, usage: NonNullable<DisplayMessage["usage"]>): DisplayMessage {
  return {
    content: `回答 ${id.toString()}`,
    createdAt: id,
    id,
    images: [],
    queueId: null,
    reasoning: "",
    role: "assistant",
    toolCalls: [],
    usage,
  };
}
function toolCalls(message: ReturnType<typeof buildTimeline>[number] | undefined) {
  return message?.parts.flatMap((part) => (part.type === "tool" ? [part.call] : [])) ?? [];
}
