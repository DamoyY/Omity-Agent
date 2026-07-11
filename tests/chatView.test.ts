import { expect, test } from "bun:test";
import type {
  DisplayEvent,
  DisplayMessage,
  DisplayQueue,
} from "../src/app/timeline";
import { buildTimeline } from "../src/app/timeline";

test("streaming tool call is hidden after the final tool call is visible", () => {
  const messages: DisplayMessage[] = [
    {
      id: 1,
      sourceId: "message-1",
      role: "assistant",
      content: "",
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

test("streaming tool call is visible before the final tool call is persisted", () => {
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
        call: { args: '{"cwd":', id: "call-1", name: "tool", index: 0 },
      },
    },
  ];

  const view = buildTimeline([], queue, events);

  expect(view).toHaveLength(1);
  expect(toolCalls(view[0])).toEqual([
    {
      id: "call-1",
      index: 0,
      input: {},
      inputText: '{"cwd":',
      name: "tool",
      streaming: true,
    },
  ]);
});

test("streaming tool call is grouped with previous assistant message", () => {
  const messages: DisplayMessage[] = [
    {
      id: 1,
      sourceId: "message-1",
      role: "assistant",
      content: "",
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

test("persisted assistant text is not repeated by stale stream events", () => {
  const messages: DisplayMessage[] = [
    {
      id: 1,
      sourceId: "message-1",
      role: "assistant",
      content: "完成",
      queueId: null,
      toolCalls: [],
      createdAt: 1,
    },
  ];
  const queue: DisplayQueue[] = [
    { id: 1, content: "run", status: "running", error: null },
  ];
  const events: DisplayEvent[] = [
    {
      id: 1,
      message: "token",
      payload: {
        kind: "assistant_text_delta",
        queueId: 1,
        messageId: "message-1",
        text: "完成",
      },
    },
  ];

  const view = buildTimeline(messages, queue, events);

  expect(view).toHaveLength(1);
  expect(view[0]?.content).toBe("完成");
  expect(view[0]?.parts).toEqual([{ type: "content", content: "完成" }]);
});

test("old streaming tool call is hidden after answer text starts", () => {
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
        call: { args: "{}", id: "call-1", name: "terminal_new_tab", index: 0 },
      },
    },
    {
      id: 2,
      message: "token",
      payload: { kind: "assistant_text_delta", queueId: 1, text: "done" },
    },
  ];

  const view = buildTimeline([], queue, events);

  expect(view).toHaveLength(1);
  expect(view[0]?.content).toBe("done");
  expect(toolCalls(view[0])).toEqual([]);
});

test("streaming tool call is reconciled by message identity and index", () => {
  const messages: DisplayMessage[] = [
    {
      id: 1,
      sourceId: "message-1",
      role: "assistant",
      content: "",
      queueId: null,
      toolCalls: [
        {
          id: "call-1",
          index: 0,
          messageId: "message-1",
          name: "terminal_new_tab",
          input: {},
        },
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
        messageId: "message-1",
        call: { args: '{"cmd":', index: 0 },
      },
    },
  ];

  const view = buildTimeline(messages, queue, events);

  expect(view).toHaveLength(1);
  expect(toolCalls(view[0])).toHaveLength(1);
  expect(toolCalls(view[0])[0]?.id).toBe("call-1");
});

test("equal tool inputs do not hide calls without stable identity", () => {
  const messages: DisplayMessage[] = [
    {
      id: 1,
      role: "assistant",
      content: "",
      queueId: null,
      toolCalls: [
        {
          id: "call-1",
          index: 0,
          name: "terminal_send_command",
          input: { command: "pwd" },
        },
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
        call: {
          args: '{"command":"pwd"}',
          index: 0,
          name: "terminal_send_command",
        },
      },
    },
  ];

  const view = buildTimeline(messages, queue, events);

  expect(toolCalls(view[0]).map((call) => call.id)).toEqual(["call-1", "i:0"]);
});

test("repeated assistant content and equal tool inputs remain visible", () => {
  const messages: DisplayMessage[] = [
    {
      id: 1,
      role: "assistant",
      content: "完成",
      queueId: null,
      toolCalls: [{ id: "call-1", index: 0, name: "read", input: {} }],
      createdAt: 1,
    },
    {
      id: 2,
      role: "assistant",
      content: "完成",
      queueId: null,
      toolCalls: [{ id: "call-2", index: 0, name: "read", input: {} }],
      createdAt: 2,
    },
  ];

  const view = buildTimeline(messages, [], []);

  expect(view[0]?.content).toBe("完成\n\n完成");
  expect(toolCalls(view[0]).map((call) => call.id)).toEqual([
    "call-1",
    "call-2",
  ]);
});

function toolCalls(
  message: ReturnType<typeof buildTimeline>[number] | undefined,
) {
  return (
    message?.parts.flatMap((part) =>
      part.type === "tool" ? [part.call] : [],
    ) ?? []
  );
}
