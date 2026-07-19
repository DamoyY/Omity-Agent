import {
  type TranscriptSnapshot,
  appendTranscriptEvents,
  emptyTranscriptData,
  reconcileTranscript,
} from "../../../src/app/frontend/services/transcript/cache";
import { expect, test } from "bun:test";
import type { DisplayEvent } from "../../../src/app/timeline";

test("replays deltas that arrive after an older snapshot", () => {
  const current = appendTranscriptEvents(emptyTranscriptData(), [textEvent(2, "B")]);
  const data = reconcileTranscript(snapshot(1, [textEvent(1, "A")]), current);
  expect(data.eventCursor).toBe(2);
  expect(data.events.map(({ id }) => id)).toEqual([1, 2]);
  expect(data.view.at(-1)?.content).toBe("AB");
});
test("deduplicates event ids without collapsing repeated text", () => {
  const data = appendTranscriptEvents(emptyTranscriptData(), [
    textEvent(1, "A"),
    textEvent(1, "A"),
    textEvent(2, "A"),
  ]);
  expect(data.events.map(({ id }) => id)).toEqual([1, 2]);
});
test("accepts a lower event id that arrives after a higher id beyond the snapshot cursor", () => {
  const initial = reconcileTranscript(snapshot(0, []));
  const high = appendTranscriptEvents(initial, [textEvent(3, "C")]);
  const complete = appendTranscriptEvents(high, [textEvent(1, "A"), textEvent(2, "B")]);
  expect(complete.events.map(({ id }) => id)).toEqual([1, 2, 3]);
  expect(complete.view.at(-1)?.content).toBe("ABC");
});
test("completed snapshots replace cleared stream events", () => {
  const streaming = reconcileTranscript(snapshot(2, [textEvent(1, "A"), textEvent(2, "B")]));
  const completed: TranscriptSnapshot = {
    ...snapshot(2, []),
    messages: [
      {
        content: "AB",
        createdAt: 1,
        id: 10,
        images: [],
        queueId: 1,
        reasoning: "",
        role: "assistant",
        sourceId: "assistant-10",
        toolCalls: [],
      },
    ],
    queue: [],
  };
  const data = reconcileTranscript(completed, streaming);
  expect(data.events).toEqual([]);
  expect(data.view).toHaveLength(1);
  expect(data.view[0]?.content).toBe("AB");
});
test("an older snapshot cannot replace a completed transcript", () => {
  const call = toolCallEvent(1);
  const completed = reconcileTranscript(snapshot(3, [call, startedEvent(2), finishedEvent(3)]));
  const stale = reconcileTranscript(snapshot(2, [call, startedEvent(2)]), completed);
  expect(stale).toBe(completed);
  const tool = stale.view.flatMap((message) => message.parts).find((part) => part.type === "tool");
  expect(tool?.type === "tool" ? tool.started : undefined).toBeUndefined();
  expect(tool?.type === "tool" ? tool.call.streaming : undefined).toBeUndefined();
});
function snapshot(eventCursor: number, events: DisplayEvent[]): TranscriptSnapshot {
  return {
    control: "running",
    eventCursor,
    events,
    messages: [],
    queue: [
      {
        content: "question",
        error: null,
        id: 1,
        status: "running",
        userMessageId: 1,
      },
    ],
  };
}
function textEvent(id: number, text: string): DisplayEvent {
  return {
    id,
    kind: "assistant_text_delta",
    messageId: "message-1",
    partId: "text-1",
    queueId: 1,
    value: text,
  };
}
function toolCallEvent(id: number): DisplayEvent {
  return {
    id,
    kind: "tool_call_delta",
    messageId: "message-1",
    partId: "tool-0",
    queueId: 1,
    value: {
      idDelta: "call-1",
      index: 0,
      nameDelta: "shell",
    },
  };
}
function startedEvent(id: number): DisplayEvent {
  return {
    id,
    kind: "tool_started",
    messageId: "message-1",
    partId: "tool-0",
    queueId: 1,
    value: "call-1",
  };
}
function finishedEvent(id: number): DisplayEvent {
  return {
    id,
    kind: "tool_finished",
    messageId: "message-1",
    partId: "tool-0",
    queueId: 1,
    value: "call-1",
  };
}
