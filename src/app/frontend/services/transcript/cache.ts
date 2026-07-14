import type { Control } from "../../../../types";
import {
  buildTimeline,
  type DisplayEvent,
  type DisplayMessage,
  type DisplayQueue,
  type TimelineMessage,
} from "../../../timeline";
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
    queue: [],
    messages: [],
    events: [],
    eventCursor: 0,
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
      events: replay?.length ? [...snapshot.events, ...replay] : snapshot.events,
      eventCursor: replay?.at(-1)?.id ?? snapshot.eventCursor,
    },
    optimisticMessages(current),
  );
}
export function appendTranscriptEvents(current: TranscriptData, incoming: DisplayEvent[]) {
  const events = [
    ...new Map(
      incoming.filter((event) => event.id > current.eventCursor).map((event) => [event.id, event]),
    ).values(),
  ].sort((left, right) => left.id - right.id);
  if (events.length === 0) return current;
  return buildTranscript(
    {
      ...current,
      events: [...current.events, ...events],
      eventCursor: events.at(-1)?.id ?? current.eventCursor,
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
  return current?.view.filter((item) => item.key.startsWith("optimistic-")) ?? [];
}
