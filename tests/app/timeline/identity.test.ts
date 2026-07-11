import { expect, test } from "bun:test";
import type {
  DisplayEvent,
  DisplayMessage,
  DisplayQueue,
} from "../../../src/app/timeline";
import { buildTimeline } from "../../../src/app/timeline";

const queue: DisplayQueue[] = [
  { id: 1, content: "run", status: "running", error: null },
];

test("persisted content hides only its identified stream", () => {
  const messages: DisplayMessage[] = [
    assistant({ id: 1, sourceId: "message-1", content: "完成" }),
  ];
  const events = [
    event("token", {
      kind: "assistant_text_delta",
      messageId: "message-1",
      text: "完成",
    }),
  ];

  const view = buildTimeline(messages, queue, events);

  expect(view[0]?.content).toBe("完成");
  expect(view[0]?.parts).toEqual([{ type: "content", content: "完成" }]);
});

test("old tool stream is hidden after answer text starts", () => {
  const events = [
    event("tool_call", {
      kind: "tool_call_delta",
      call: { args: "{}", id: "call-1", name: "open", index: 0 },
    }),
    event("token", { kind: "assistant_text_delta", text: "done" }, 2),
  ];

  const view = buildTimeline([], queue, events);

  expect(view[0]?.content).toBe("done");
  expect(toolCalls(view[0])).toEqual([]);
});

test("tool stream reconciles by message identity and index", () => {
  const messages: DisplayMessage[] = [
    assistant({
      id: 1,
      sourceId: "message-1",
      call: {
        id: "call-1",
        index: 0,
        messageId: "message-1",
        name: "open",
        input: {},
      },
    }),
  ];
  const events = [
    event("tool_call", {
      kind: "tool_call_delta",
      messageId: "message-1",
      call: { args: '{"cmd":', index: 0 },
    }),
  ];

  expect(toolCalls(buildTimeline(messages, queue, events)[0])).toHaveLength(1);
});

test("equal tool inputs do not hide unidentified calls", () => {
  const messages: DisplayMessage[] = [
    assistant({
      id: 1,
      call: { id: "call-1", index: 0, name: "send", input: { command: "pwd" } },
    }),
  ];
  const events = [
    event("tool_call", {
      kind: "tool_call_delta",
      call: { args: '{"command":"pwd"}', index: 0, name: "send" },
    }),
  ];

  const calls = toolCalls(buildTimeline(messages, queue, events)[0]);

  expect(calls.map((call) => call.id)).toEqual(["call-1", "i:0"]);
});

test("repeated assistant content and tool inputs remain visible", () => {
  const messages: DisplayMessage[] = [
    assistant({ id: 1, content: "完成", call: call("call-1") }),
    assistant({ id: 2, content: "完成", call: call("call-2") }),
  ];

  const view = buildTimeline(messages, [], []);

  expect(view[0]?.content).toBe("完成\n\n完成");
  expect(toolCalls(view[0]).map((item) => item.id)).toEqual([
    "call-1",
    "call-2",
  ]);
});

function assistant(options: {
  id: number;
  content?: string;
  sourceId?: string;
  call?: DisplayMessage["toolCalls"][number];
}): DisplayMessage {
  return {
    id: options.id,
    ...(options.sourceId ? { sourceId: options.sourceId } : {}),
    role: "assistant",
    content: options.content ?? "",
    queueId: null,
    toolCalls: options.call ? [options.call] : [],
    createdAt: options.id,
  };
}

function call(id: string) {
  return { id, index: 0, name: "read", input: {} };
}

function event(
  message: string,
  payload: Record<string, unknown>,
  id = 1,
): DisplayEvent {
  return { id, message, payload: { ...payload, queueId: 1 } };
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
