import {
  type DisplayEvent,
  type DisplayMessage,
  type DisplayQueue,
  type TimelineMessage,
  buildTimeline,
} from "../../../timeline";
import type { Control } from "../../../../types";

export interface TranscriptSnapshot {
  control: Control;
  queue: DisplayQueue[];
  messages: DisplayMessage[];
  events: DisplayEvent[];
  eventCursor: number;
}
export interface TranscriptData extends TranscriptSnapshot {
  snapshotCursor: number;
  view: TimelineMessage[];
}
export function emptyTranscriptData(): TranscriptData {
  return {
    control: "running",
    eventCursor: 0,
    events: [],
    messages: [],
    queue: [],
    snapshotCursor: 0,
    view: [],
  };
}
export function reconcileTranscript(
  snapshot: TranscriptSnapshot,
  current?: TranscriptData,
): TranscriptData {
  const replay = current?.events.filter((event) => event.id > snapshot.eventCursor) ?? [];
  const events = mergeEvents(snapshot.events, replay);
  return buildTranscript(
    {
      ...snapshot,
      eventCursor: Math.max(snapshot.eventCursor, current?.eventCursor ?? 0),
      events,
    },
    optimisticMessages(current),
    snapshot.eventCursor,
  );
}
export function appendTranscriptEvents(current: TranscriptData, incoming: DisplayEvent[]) {
  const accepted = incoming.filter((event) => event.id > current.snapshotCursor);
  const events = mergeEvents(current.events, accepted);
  if (events.length === current.events.length) {
    return current;
  }
  return buildTranscript(
    {
      ...current,
      eventCursor: Math.max(current.eventCursor, ...accepted.map((event) => event.id)),
      events,
    },
    optimisticMessages(current),
    current.snapshotCursor,
  );
}
export function rebuildTranscript(
  current: TranscriptData,
  changes: Partial<Pick<TranscriptData, "queue" | "messages" | "events">>,
) {
  return buildTranscript(
    { ...current, ...changes },
    optimisticMessages(current),
    current.snapshotCursor,
  );
}
export function withoutOptimistic(current: TranscriptData, key: string): TranscriptData {
  return { ...current, view: current.view.filter((item) => item.key !== key) };
}
function buildTranscript(
  snapshot: TranscriptSnapshot,
  optimistic: TimelineMessage[],
  snapshotCursor: number,
): TranscriptData {
  return {
    ...snapshot,
    snapshotCursor,
    view: buildTimeline(snapshot.messages, snapshot.queue, snapshot.events, optimistic),
  };
}
function mergeEvents(left: DisplayEvent[], right: DisplayEvent[]) {
  return [...new Map([...left, ...right].map((event) => [event.id, event])).values()].toSorted(
    (a, b) => a.id - b.id,
  );
}
function optimisticMessages(current?: TranscriptData) {
  return current?.view.filter((item) => item.optimistic === true) ?? [];
}
