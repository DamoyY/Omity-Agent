import { expect, test } from "bun:test";
import {
  appendTranscriptEvents,
  emptyTranscriptData,
  reconcileTranscript,
  type TranscriptSnapshot,
} from "../../../src/app/frontend/services/transcript/cache";
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
test("completed snapshots replace cleared stream events", () => {
  const streaming = reconcileTranscript(snapshot(2, [textEvent(1, "A"), textEvent(2, "B")]));
  const completed: TranscriptSnapshot = {
    ...snapshot(2, []),
    queue: [],
    messages: [
      {
        id: 10,
        sourceId: "assistant-10",
        role: "assistant",
        content: "AB",
        reasoning: "",
        images: [],
        queueId: 1,
        toolCalls: [],
        createdAt: 1,
      },
    ],
  };
  const data = reconcileTranscript(completed, streaming);
  expect(data.events).toEqual([]);
  expect(data.view).toHaveLength(1);
  expect(data.view[0]?.content).toBe("AB");
});
function snapshot(eventCursor: number, events: DisplayEvent[]): TranscriptSnapshot {
  return {
    control: "running",
    queue: [
      {
        id: 1,
        content: "question",
        status: "running",
        error: null,
        userMessageId: 1,
      },
    ],
    messages: [],
    events,
    eventCursor,
  };
}
function textEvent(id: number, text: string): DisplayEvent {
  return {
    id,
    message: "assistant_text_delta",
    payload: { kind: "assistant_text_delta", queueId: 1, text },
  };
}
