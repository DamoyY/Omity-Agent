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
  view: TimelineMessage[];
}
export function emptyTranscriptData(): TranscriptData {
  return {
    control: "running",
    eventCursor: 0,
    events: [],
    messages: [],
    queue: [],
    view: [],
  };
}
export function reconcileTranscript(
  snapshot: TranscriptSnapshot,
  current?: TranscriptData,
): TranscriptData {
  const replay = current?.events.filter((event) => event.id > snapshot.eventCursor);
  return buildTranscript(
    {
      ...snapshot,
      eventCursor: replay?.at(-1)?.id ?? snapshot.eventCursor,
      events: replay?.length ? [...snapshot.events, ...replay] : snapshot.events,
    },
    optimisticMessages(current),
  );
}
export function appendTranscriptEvents(current: TranscriptData, incoming: DisplayEvent[]) {
  const events = [
    ...new Map(
      incoming.filter((event) => event.id > current.eventCursor).map((event) => [event.id, event]),
    ).values(),
  ].toSorted((left, right) => left.id - right.id);
  if (events.length === 0) {
    return current;
  }
  return buildTranscript(
    {
      ...current,
      eventCursor: events.at(-1)?.id ?? current.eventCursor,
      events: [...current.events, ...events],
    },
    optimisticMessages(current),
  );
}
export function rebuildTranscript(
  current: TranscriptData,
  changes: Partial<Pick<TranscriptData, "queue" | "messages" | "events">>,
) {
  return buildTranscript({ ...current, ...changes }, optimisticMessages(current));
}
export function withoutOptimistic(current: TranscriptData, key: string): TranscriptData {
  return { ...current, view: current.view.filter((item) => item.key !== key) };
}
function buildTranscript(
  snapshot: TranscriptSnapshot,
  optimistic: TimelineMessage[],
): TranscriptData {
  return {
    ...snapshot,
    view: [...buildTimeline(snapshot.messages, snapshot.queue, snapshot.events), ...optimistic],
  };
}
function optimisticMessages(current?: TranscriptData) {
  return current?.view.filter((item) => item.optimistic === true) ?? [];
}
