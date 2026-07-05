import { expect, test } from "bun:test";
import { buildView } from "../src/app/frontend/components/chatView";
import type {
  Message,
  QueueItem,
  StreamEvent,
} from "../src/app/frontend/services/client";

test("streaming tool call is hidden after the final tool call is visible", () => {
  const messages: Message[] = [
    {
      id: 1,
      role: "assistant",
      content: "",
      queueId: null,
      toolCalls: [{ id: "call-1", name: "terminal_new_tab", input: {} }],
      createdAt: 1,
    },
  ];
  const queue: QueueItem[] = [
    { id: 1, content: "run", status: "running", error: null },
  ];
  const events: StreamEvent[] = [
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

  const view = buildView(messages, queue, events);

  expect(view).toHaveLength(1);
  expect(view[0]?.toolCalls).toHaveLength(1);
  expect(view[0]?.toolCalls[0]?.streaming).toBeUndefined();
});

test("streaming tool call is visible before the final tool call is persisted", () => {
  const queue: QueueItem[] = [
    { id: 1, content: "run", status: "running", error: null },
  ];
  const events: StreamEvent[] = [
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

  const view = buildView([], queue, events);

  expect(view).toHaveLength(1);
  expect(view[0]?.toolCalls).toEqual([
    {
      id: "call-1",
      input: {},
      inputText: '{"cwd":',
      name: "tool",
      streaming: true,
    },
  ]);
});

test("streaming tool call is grouped with previous assistant message", () => {
  const messages: Message[] = [
    {
      id: 1,
      role: "assistant",
      content: "",
      queueId: null,
      toolCalls: [{ id: "call-1", name: "terminal_new_tab", input: {} }],
      createdAt: 1,
    },
  ];
  const queue: QueueItem[] = [
    { id: 1, content: "run", status: "running", error: null },
  ];
  const events: StreamEvent[] = [
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

  const view = buildView(messages, queue, events);

  expect(view).toHaveLength(1);
  expect(view[0]?.toolCalls.map((call) => call.id)).toEqual([
    "call-1",
    "call-2",
  ]);
});

test("old streaming tool call is hidden after answer text starts", () => {
  const queue: QueueItem[] = [
    { id: 1, content: "run", status: "running", error: null },
  ];
  const events: StreamEvent[] = [
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

  const view = buildView([], queue, events);

  expect(view).toHaveLength(1);
  expect(view[0]?.content).toBe("done");
  expect(view[0]?.toolCalls).toEqual([]);
});

test("incomplete old streaming tool call is hidden after final tool is visible", () => {
  const messages: Message[] = [
    {
      id: 1,
      role: "assistant",
      content: "",
      queueId: null,
      toolCalls: [{ id: "call-1", name: "terminal_new_tab", input: {} }],
      createdAt: 1,
    },
  ];
  const queue: QueueItem[] = [
    { id: 1, content: "run", status: "running", error: null },
  ];
  const events: StreamEvent[] = [
    {
      id: 1,
      message: "tool_call",
      payload: {
        kind: "tool_call_delta",
        queueId: 1,
        call: { args: '{"cmd":', index: 0 },
      },
    },
  ];

  const view = buildView(messages, queue, events);

  expect(view).toHaveLength(1);
  expect(view[0]?.toolCalls).toHaveLength(1);
  expect(view[0]?.toolCalls[0]?.id).toBe("call-1");
});
