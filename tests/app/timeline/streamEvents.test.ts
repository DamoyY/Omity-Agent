import { type DisplayEvent, type DisplayQueue, buildTimeline } from "../../../src/app/timeline";
import { expect, test } from "bun:test";
import { countTokens } from "../../../src/runtime/tokenizer";

const queue: DisplayQueue[] = [
  { content: "run", error: null, id: 1, status: "running", userMessageId: 1 },
];
test("preserves interleaved reasoning, text, and tool part order", () => {
  const events: DisplayEvent[] = [
    textEvent(1, "assistant_reasoning_delta", "reasoning-1", "分析"),
    toolEvent(2, "tool-0", { idDelta: "call-1", index: 0, nameDelta: "inspect" }),
    textEvent(3, "assistant_text_delta", "text-1", "阶段结论"),
    textEvent(4, "assistant_reasoning_delta", "reasoning-2", "继续分析"),
    toolEvent(5, "tool-1", { idDelta: "call-2", index: 1, nameDelta: "execute" }),
  ];
  const parts = buildTimeline([], queue, events)[0]?.parts;
  expect(parts?.map((part) => part.type)).toEqual([
    "reasoning",
    "tool",
    "content",
    "reasoning",
    "tool",
  ]);
});
test("merges only events sharing an explicit part identity", () => {
  const calls = streamedCalls([
    toolEvent(1, "tool-0", { idDelta: "call-1", index: 0, nameDelta: "terminal_send_command" }),
    toolEvent(2, "tool-1", { idDelta: "call-2", index: 0, nameDelta: "terminal_send_command" }),
    toolEvent(3, "tool-0", { argumentsDelta: '{"command":"first"}', index: 0 }),
    toolEvent(4, "tool-1", { argumentsDelta: '{"command":"second"}', index: 0 }),
  ]);
  expect(calls.map(({ id, inputText }) => ({ id, inputText }))).toEqual([
    { id: "call-1", inputText: '{"command":"first"}' },
    { id: "call-2", inputText: '{"command":"second"}' },
  ]);
});
test("keeps parallel tool calls separate and accepts cumulative arguments", () => {
  const calls = streamedCalls([
    toolEvent(1, "tool-0", { idDelta: "call-1", index: 0, nameDelta: "first_tool" }),
    toolEvent(2, "tool-1", { idDelta: "call-2", index: 1, nameDelta: "second_tool" }),
    toolEvent(3, "tool-0", { argumentsDelta: '{"value":', index: 0 }),
    toolEvent(4, "tool-1", { argumentsDelta: '{"value":2}', index: 1 }),
    toolEvent(5, "tool-0", { argumentsDelta: "10}", index: 0 }),
  ]);
  expect(calls.map(({ id, inputText }) => ({ id, inputText }))).toEqual([
    { id: "call-1", inputText: '{"value":10}' },
    { id: "call-2", inputText: '{"value":2}' },
  ]);
});
test("preserves repeated argument deltas and Freeform input", () => {
  const [call] = streamedCalls([
    toolEvent(1, "tool-0", {
      argumentsDelta: "*** Begin ",
      freeform: true,
      idDelta: "call-1",
      index: 0,
      nameDelta: "apply_patch",
    }),
    toolEvent(2, "tool-0", { argumentsDelta: "Patch", index: 0 }),
    toolEvent(3, "tool-0", { argumentsDelta: "Patch", index: 0 }),
  ]);
  expect(call?.rawInput).toBe("*** Begin PatchPatch");
  expect(call?.inputTokens).toBe(countTokens("*** Begin PatchPatch"));
});
function streamedCalls(events: DisplayEvent[]) {
  return (
    buildTimeline([], queue, events)[0]?.parts.flatMap((part) =>
      part.type === "tool" ? [part.call] : [],
    ) ?? []
  );
}
function toolEvent(
  id: number,
  partId: string,
  value: Extract<DisplayEvent, { kind: "tool_call_delta" }>["value"],
): DisplayEvent {
  return {
    id,
    kind: "tool_call_delta",
    messageId: "message-1",
    partId,
    queueId: 1,
    value,
  };
}
function textEvent(
  id: number,
  kind: "assistant_reasoning_delta" | "assistant_text_delta",
  partId: string,
  value: string,
): DisplayEvent {
  return { id, kind, messageId: "message-1", partId, queueId: 1, value };
}
