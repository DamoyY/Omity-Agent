import type {
  DisplayEvent,
  DisplayMessage,
  DisplayQueue,
  DisplayRole,
  TimelineMessage,
} from "./types";
import {
  eventMessageId,
  eventQueueId,
  eventStartedCallId,
  streamTimelineMessages,
} from "./streamEvents";
import { groupAssistantMessages } from "./grouping";

export type {
  DisplayEvent,
  DisplayImage,
  DisplayMessage,
  DisplayQueue,
  DisplayRole,
  DisplayToolCall,
  TokenUsage,
  TimelineMessage,
  TimelinePart,
} from "./types";
export { displayStreamEvent } from "./streamEvents";
export function buildTimeline(
  messages: DisplayMessage[],
  queue: DisplayQueue[],
  events: DisplayEvent[],
): TimelineMessage[] {
  const outputs = new Map(
    messages.flatMap((item) =>
      item.role === "tool" && item.toolCallId ? [[item.toolCallId, item] as const] : [],
    ),
  );
  const startedCallIds = new Set(
    events.flatMap((event) => {
      const callId = eventStartedCallId(event);
      return callId ? [callId] : [];
    }),
  );
  const visible = messages
    .filter((item) => item.role !== "tool")
    .map((item) => withParts(item, `message-${item.id.toString()}`, outputs, startedCallIds));
  const persistedSourceIds = new Set(
    messages.map((item) => item.sourceId).filter((id) => id !== undefined),
  );
  const knownQueue = new Set(messages.map((item) => item.queueId));
  const pending = queue
    .filter((item) => item.status === "pending" && !knownQueue.has(item.id))
    .map((item) => synthetic("user", item.content, `queue-${item.id.toString()}`));
  const live = queue
    .filter((item) => item.status === "running" || item.status === "paused")
    .filter((item) => item.userMessageId !== null)
    .flatMap((item) => {
      const streamEvents = events
        .filter((event) => eventQueueId(event) === item.id)
        .filter((event) => !persistedSourceIds.has(eventMessageId(event)));
      return streamTimelineMessages(streamEvents, outputs, startedCallIds);
    });
  return groupAssistantMessages([...visible, ...live, ...pending]);
}
function withParts(
  message: DisplayMessage,
  key: string,
  outputs: Map<string, DisplayMessage>,
  startedCallIds: Set<string>,
): TimelineMessage {
  return {
    content: message.content,
    createdAt: message.createdAt,
    id: message.id,
    key,
    role: message.role,
    ...(message.usage ? { usage: message.usage } : {}),
    parts: [
      ...(message.reasoning.trim()
        ? [{ content: message.reasoning, type: "reasoning" } as const]
        : []),
      ...(message.content.trim() ? [{ content: message.content, type: "content" } as const] : []),
      ...message.toolCalls.map((call) => ({
        call,
        output: outputs.get(call.id),
        type: "tool" as const,
        ...(startedCallIds.has(call.id) ? { started: true } : {}),
      })),
    ],
  };
}
function synthetic(role: DisplayRole, content: string, key: string): TimelineMessage {
  return {
    content,
    createdAt: 0,
    id: -1,
    key,
    parts: content.trim() ? [{ content, type: "content" }] : [],
    role,
  };
}
