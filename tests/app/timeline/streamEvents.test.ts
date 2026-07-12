import { expect, test } from "bun:test";
import type { DisplayEvent, DisplayQueue } from "../../../src/app/timeline";
import { buildTimeline } from "../../../src/app/timeline";
import { countTokens } from "../../../src/runtime/tokenizer";

const queue: DisplayQueue[] = [
  { id: 1, content: "run", status: "running", error: null },
];

test("merges tool identity and argument chunks by index", () => {
  const calls = streamedCalls([
    toolEvent(1, { id: "call-1", index: 0, name: "terminal_send_command" }),
    toolEvent(2, { args: '{"command":"where.exe codex"', index: 0 }),
    toolEvent(3, { args: ',"waiting":10}', index: 0 }),
  ]);

  expect(calls).toEqual([
    {
      id: "call-1",
      index: 0,
      input: {},
      inputTokens: countTokens('{"command":"where.exe codex","waiting":10}'),
      inputText: '{"command":"where.exe codex","waiting":10}',
      name: "terminal_send_command",
      streaming: true,
    },
  ]);
});

test("upgrades an index-only tool call when its identity arrives later", () => {
  const calls = streamedCalls([
    toolEvent(1, { args: '{"command":"pwd"}', index: 0 }),
    toolEvent(2, { id: "call-1", index: 0, name: "terminal_send_command" }),
  ]);

  expect(calls).toHaveLength(1);
  expect(calls[0]).toMatchObject({
    id: "call-1",
    index: 0,
    inputText: '{"command":"pwd"}',
    name: "terminal_send_command",
  });
});

test("reconciles separate id-only and index-only chunks", () => {
  const calls = streamedCalls([
    toolEvent(1, { id: "call-1", name: "terminal_send_command" }),
    toolEvent(2, { args: '{"command":"pwd"}', index: 0 }),
    toolEvent(3, { id: "call-1", index: 0 }),
  ]);

  expect(calls).toHaveLength(1);
  expect(calls[0]).toMatchObject({
    id: "call-1",
    index: 0,
    inputText: '{"command":"pwd"}',
    name: "terminal_send_command",
  });
});

test("preserves repeated argument delta content", () => {
  const calls = streamedCalls([
    toolEvent(1, { args: '{"value":"', id: "call-1", index: 0 }),
    toolEvent(2, { args: "aa", index: 0 }),
    toolEvent(3, { args: "aa", index: 0 }),
    toolEvent(4, { args: '"}', index: 0 }),
  ]);

  expect(calls[0]?.inputText).toBe('{"value":"aaaa"}');
});

test("accepts cumulative argument snapshots", () => {
  const calls = streamedCalls([
    toolEvent(1, { args: '{"value":', id: "call-1", index: 0 }),
    toolEvent(2, { args: '{"value":1', index: 0 }),
    toolEvent(3, { args: '{"value":10}', index: 0 }),
  ]);

  expect(calls[0]?.inputText).toBe('{"value":10}');
});

test("updates token count from raw argument text while streaming", () => {
  const initial = streamedCalls([
    toolEvent(1, { args: '{"command":"', id: "call-1", index: 0 }),
  ])[0];
  const complete = streamedCalls([
    toolEvent(1, { args: '{"command":"', id: "call-1", index: 0 }),
    toolEvent(2, { args: 'echo 你好"}', index: 0 }),
  ])[0];

  expect(initial?.inputTokens).toBe(countTokens('{"command":"'));
  expect(complete?.inputTokens).toBe(countTokens('{"command":"echo 你好"}'));
});

test("keeps parallel tool call indexes separate", () => {
  const calls = streamedCalls([
    toolEvent(1, { id: "call-1", index: 0, name: "first_tool" }),
    toolEvent(2, { id: "call-2", index: 1, name: "second_tool" }),
    toolEvent(3, { args: '{"value":1}', index: 0 }),
    toolEvent(4, { args: '{"value":2}', index: 1 }),
  ]);

  expect(
    calls.map(({ id, inputText, name }) => ({ id, inputText, name })),
  ).toEqual([
    { id: "call-1", inputText: '{"value":1}', name: "first_tool" },
    { id: "call-2", inputText: '{"value":2}', name: "second_tool" },
  ]);
});

function streamedCalls(events: DisplayEvent[]) {
  const view = buildTimeline([], queue, events);
  return (
    view[0]?.parts.flatMap((part) =>
      part.type === "tool" ? [part.call] : [],
    ) ?? []
  );
}

function toolEvent(
  id: number,
  call: { args?: string; id?: string; index?: number; name?: string },
): DisplayEvent {
  return {
    id,
    message: "tool_call",
    payload: { kind: "tool_call_delta", queueId: 1, call },
  };
}
