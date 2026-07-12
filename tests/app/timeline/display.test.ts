import { expect, test } from "bun:test";
import type {
  DisplayEvent,
  DisplayMessage,
  DisplayQueue,
} from "../../../src/app/timeline";
import { buildTimeline } from "../../../src/app/timeline";

test("streaming tool call is hidden after the final tool call is visible", () => {
  const messages: DisplayMessage[] = [
    {
      id: 1,
      sourceId: "message-1",
      role: "assistant",
      content: "",
      reasoning: "",
      images: [],
      queueId: null,
      toolCalls: [
        { id: "call-1", index: 0, name: "terminal_new_tab", input: {} },
      ],
      createdAt: 1,
    },
  ];
  const queue: DisplayQueue[] = [
    { id: 1, content: "run", status: "running", error: null },
  ];
  const events: DisplayEvent[] = [
    {
      id: 1,
      message: "tool_call",
      payload: {
        kind: "tool_call_delta",
        queueId: 1,
        call: { id: "call-1", name: "terminal_new_tab", index: 0 },
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
      id: 1,
      sourceId: "message-1",
      role: "assistant",
      content: "",
      reasoning: "",
      images: [],
      queueId: null,
      toolCalls: [
        { id: "call-1", index: 0, name: "terminal_new_tab", input: {} },
      ],
      createdAt: 1,
    },
  ];
  const queue: DisplayQueue[] = [
    { id: 1, content: "run", status: "running", error: null },
  ];
  const events: DisplayEvent[] = [
    {
      id: 1,
      message: "tool_call",
      payload: {
        kind: "tool_call_delta",
        queueId: 1,
        call: { id: "call-2", name: "terminal_send_command", index: 1 },
      },
    },
  ];

  const view = buildTimeline(messages, queue, events);

  expect(view).toHaveLength(1);
  expect(toolCalls(view[0]).map((call) => call.id)).toEqual([
    "call-1",
    "call-2",
  ]);
});

test("tool output retains images", () => {
  const image = {
    src: "data:image/png;base64,iVBORw0KGgo=",
    mimeType: "image/png",
  };
  const messages: DisplayMessage[] = [
    {
      id: 1,
      role: "assistant",
      content: "",
      reasoning: "",
      images: [],
      queueId: null,
      toolCalls: [{ id: "call-1", index: 0, name: "capture", input: {} }],
      createdAt: 1,
    },
    {
      id: 2,
      role: "tool",
      content: "",
      reasoning: "",
      images: [image],
      queueId: null,
      toolCalls: [],
      toolCallId: "call-1",
      createdAt: 2,
    },
  ];

  const view = buildTimeline(messages, [], []);
  const output = view[0]?.parts.find((part) => part.type === "tool")?.output;

  expect(output?.images).toEqual([image]);
});

test("started tool call exposes an empty output state", () => {
  const messages: DisplayMessage[] = [
    {
      id: 1,
      role: "assistant",
      content: "",
      reasoning: "",
      images: [],
      queueId: null,
      toolCalls: [{ id: "call-1", index: 0, name: "capture", input: {} }],
      createdAt: 1,
    },
  ];
  const events: DisplayEvent[] = [
    {
      id: 1,
      message: "tool_started",
      payload: { kind: "tool_started", queueId: 1, callId: "call-1" },
    },
  ];

  const part = buildTimeline(messages, [], events)[0]?.parts.find(
    (item) => item.type === "tool",
  );

  expect(part?.started).toBe(true);
  expect(part?.output).toBeUndefined();
});

test("grouped assistant messages retain the latest token usage", () => {
  const usage = {
    inputTokens: 1200,
    outputTokens: 300,
    cacheReadTokens: 900,
  };
  const messages: DisplayMessage[] = [
    assistant(1, {
      inputTokens: 800,
      outputTokens: 200,
      cacheReadTokens: 400,
    }),
    assistant(2, usage),
  ];

  const view = buildTimeline(messages, [], []);

  expect(view).toHaveLength(1);
  expect(view[0]?.usage).toEqual(usage);
});

function assistant(
  id: number,
  usage: NonNullable<DisplayMessage["usage"]>,
): DisplayMessage {
  return {
    id,
    role: "assistant",
    content: `回答 ${id.toString()}`,
    reasoning: "",
    images: [],
    queueId: null,
    toolCalls: [],
    usage,
    createdAt: id,
  };
}

function toolCalls(
  message: ReturnType<typeof buildTimeline>[number] | undefined,
) {
  return (
    message?.parts.flatMap((part) =>
      part.type === "tool" ? [part.call] : [],
    ) ?? []
  );
}
