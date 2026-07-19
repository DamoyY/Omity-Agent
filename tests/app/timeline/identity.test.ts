import {
  type DisplayEvent,
  type DisplayMessage,
  type DisplayQueue,
  buildTimeline,
} from "../../../src/app/timeline";
import { expect, test } from "bun:test";

const queue: DisplayQueue[] = [{ content: "run", error: null, id: 1, status: "running" }];
test("persisted content hides only its identified stream", () => {
  const messages: DisplayMessage[] = [assistant({ content: "完成", id: 1, sourceId: "message-1" })];
  const events = [event("assistant_text_delta", "完成", { messageId: "message-1" })];
  const view = buildTimeline(messages, queue, events);
  expect(view[0]?.content).toBe("完成");
  expect(view[0]?.parts).toEqual([{ content: "完成", type: "content" }]);
});
test("persisted reasoning hides its identified stream", () => {
  const messages: DisplayMessage[] = [
    assistant({ id: 1, reasoning: "已思考", sourceId: "message-1" }),
  ];
  const events = [event("assistant_reasoning_delta", "已思考", { messageId: "message-1" })];
  const view = buildTimeline(messages, queue, events);
  expect(view[0]?.parts).toEqual([{ content: "已思考", type: "reasoning" }]);
});
test("streamed reasoning is shown before answer text", () => {
  const events = [
    event("assistant_reasoning_delta", "分析"),
    event("assistant_text_delta", "答案", { id: 2, partId: "text-1" }),
  ];
  const view = buildTimeline([], queue, events);
  expect(view[0]?.parts).toEqual([
    { content: "分析", type: "reasoning" },
    { content: "答案", type: "content" },
  ]);
});
test("tool streams from distinct messages remain visible after answer text starts", () => {
  const events = [
    event("tool_call_delta", {
      argumentsDelta: "{}",
      idDelta: "call-1",
      index: 0,
      nameDelta: "open",
    }),
    event("assistant_text_delta", "done", {
      id: 2,
      messageId: "message-2",
      partId: "text-1",
    }),
  ];
  const view = buildTimeline([], queue, events);
  expect(view[0]?.content).toBe("done");
  expect(toolCalls(view[0]).map((call) => call.id)).toEqual(["call-1"]);
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
    event("tool_call_delta", { argumentsDelta: '{"cmd":', index: 0 }, { messageId: "message-1" }),
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
    event("tool_call_delta", {
      argumentsDelta: '{"command":"pwd"}',
      index: 0,
      nameDelta: "send",
    }),
  ];
  const calls = toolCalls(buildTimeline(messages, queue, events)[0]);
  expect(calls.map((call) => call.id)).toEqual(["call-1", "stream:message-live:tool-0"]);
});
test("repeated assistant content and tool inputs remain visible", () => {
  const messages: DisplayMessage[] = [
    assistant({ call: toolCall("call-1"), content: "完成", id: 1 }),
    assistant({ call: toolCall("call-2"), content: "完成", id: 2 }),
  ];
  const view = buildTimeline(messages, [], []);
  expect(view[0]?.content).toBe("完成\n\n完成");
  expect(toolCalls(view[0]).map((item) => item.id)).toEqual(["call-1", "call-2"]);
});
test("equal reasoning from distinct model responses remains visible", () => {
  const messages: DisplayMessage[] = [
    assistant({ call: toolCall("call-1"), id: 1, reasoning: "独立分析" }),
    assistant({ call: toolCall("call-2"), id: 2, reasoning: "独立分析" }),
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
    content: options.content ?? "",
    createdAt: options.id,
    images: [],
    queueId: null,
    reasoning: options.reasoning ?? "",
    role: "assistant",
    toolCalls: options.call ? [options.call] : [],
  };
}
function toolCall(id: string) {
  return { id, index: 0, input: {}, inputTokens: 1, name: "read" };
}
function event(
  kind: DisplayEvent["kind"],
  value: string | Extract<DisplayEvent, { kind: "tool_call_delta" }>["value"],
  options: { id?: number; messageId?: string; partId?: string } = {},
): DisplayEvent {
  const base = {
    id: options.id ?? 1,
    messageId: options.messageId ?? "message-live",
    partId: options.partId ?? (kind === "tool_call_delta" ? "tool-0" : "reasoning-1"),
    queueId: 1,
  };
  if (kind === "tool_call_delta" && typeof value !== "string") {
    return { ...base, kind, value };
  }
  if (
    (kind === "assistant_reasoning_delta" || kind === "assistant_text_delta") &&
    typeof value === "string"
  ) {
    return { ...base, kind, value };
  }
  throw new Error("测试流事件类型无效");
}
function toolCalls(message: ReturnType<typeof buildTimeline>[number] | undefined) {
  return message?.parts.flatMap((part) => (part.type === "tool" ? [part.call] : [])) ?? [];
}
