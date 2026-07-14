import type { DisplayEvent, DisplayMessage, DisplayQueue } from "../../../src/app/timeline";
import { expect, test } from "bun:test";
import { buildTimeline } from "../../../src/app/timeline";
const queue: DisplayQueue[] = [{ content: "run", error: null, id: 1, status: "running" }];
test("persisted content hides only its identified stream", () => {
  const messages: DisplayMessage[] = [assistant({ content: "完成", id: 1, sourceId: "message-1" })];
  const events = [
    event("token", {
      kind: "assistant_text_delta",
      messageId: "message-1",
      text: "完成",
    }),
  ];
  const view = buildTimeline(messages, queue, events);
  expect(view[0]?.content).toBe("完成");
  expect(view[0]?.parts).toEqual([{ content: "完成", type: "content" }]);
});
test("persisted reasoning hides its identified stream", () => {
  const messages: DisplayMessage[] = [
    assistant({ id: 1, reasoning: "已思考", sourceId: "message-1" }),
  ];
  const events = [
    event("reasoning", {
      kind: "assistant_reasoning_delta",
      messageId: "message-1",
      text: "已思考",
    }),
  ];
  const view = buildTimeline(messages, queue, events);
  expect(view[0]?.parts).toEqual([{ content: "已思考", type: "reasoning" }]);
});
test("streamed reasoning is shown before answer text", () => {
  const events = [
    event("reasoning", {
      kind: "assistant_reasoning_delta",
      text: "分析",
    }),
    event("token", { kind: "assistant_text_delta", text: "答案" }, 2),
  ];
  const view = buildTimeline([], queue, events);
  expect(view[0]?.parts).toEqual([
    { content: "分析", type: "reasoning" },
    { content: "答案", type: "content" },
  ]);
});
test("old tool stream is hidden after answer text starts", () => {
  const events = [
    event("tool_call", {
      call: { args: "{}", id: "call-1", index: 0, name: "open" },
      kind: "tool_call_delta",
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
      call: {
        id: "call-1",
        index: 0,
        input: {},
        inputTokens: 1,
        messageId: "message-1",
        name: "open",
      },
      id: 1,
      sourceId: "message-1",
    }),
  ];
  const events = [
    event("tool_call", {
      call: { args: '{"cmd":', index: 0 },
      kind: "tool_call_delta",
      messageId: "message-1",
    }),
  ];
  expect(toolCalls(buildTimeline(messages, queue, events)[0])).toHaveLength(1);
});
test("equal tool inputs do not hide unidentified calls", () => {
  const messages: DisplayMessage[] = [
    assistant({
      call: {
        id: "call-1",
        index: 0,
        input: { command: "pwd" },
        inputTokens: 5,
        name: "send",
      },
      id: 1,
    }),
  ];
  const events = [
    event("tool_call", {
      call: { args: '{"command":"pwd"}', index: 0, name: "send" },
      kind: "tool_call_delta",
    }),
  ];
  const calls = toolCalls(buildTimeline(messages, queue, events)[0]);
  expect(calls.map((call) => call.id)).toEqual(["call-1", "i:0"]);
});
test("repeated assistant content and tool inputs remain visible", () => {
  const messages: DisplayMessage[] = [
    assistant({ call: call("call-1"), content: "完成", id: 1 }),
    assistant({ call: call("call-2"), content: "完成", id: 2 }),
  ];
  const view = buildTimeline(messages, [], []);
  expect(view[0]?.content).toBe("完成\n\n完成");
  expect(toolCalls(view[0]).map((item) => item.id)).toEqual(["call-1", "call-2"]);
});
test("equal reasoning from distinct model responses remains visible", () => {
  const messages: DisplayMessage[] = [
    assistant({ call: call("call-1"), id: 1, reasoning: "独立分析" }),
    assistant({ call: call("call-2"), id: 2, reasoning: "独立分析" }),
  ];
  const reasoning = buildTimeline(messages, [], [])[0]?.parts.flatMap((part) =>
    part.type === "reasoning" ? [part.content] : [],
  );
  expect(reasoning).toEqual(["独立分析", "独立分析"]);
});
function assistant(options: {
  id: number;
  content?: string;
  reasoning?: string;
  sourceId?: string;
  call?: DisplayMessage["toolCalls"][number];
}): DisplayMessage {
  return {
    id: options.id,
    ...(options.sourceId ? { sourceId: options.sourceId } : {}),
    role: "assistant",
    content: options.content ?? "",
    reasoning: options.reasoning ?? "",
    images: [],
    queueId: null,
    toolCalls: options.call ? [options.call] : [],
    createdAt: options.id,
  };
}
function call(id: string) {
  return { id, index: 0, input: {}, inputTokens: 1, name: "read" };
}
function event(message: string, payload: Record<string, unknown>, id = 1): DisplayEvent {
  return { id, message, payload: { ...payload, queueId: 1 } };
}
function toolCalls(message: ReturnType<typeof buildTimeline>[number] | undefined) {
  return message?.parts.flatMap((part) => (part.type === "tool" ? [part.call] : [])) ?? [];
}
