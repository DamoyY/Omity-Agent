import type {
  DisplayEvent,
  DisplayMessage,
  DisplayQueue,
  DisplayRole,
  TimelineMessage,
  TimelinePart,
} from "./types";
import {
  currentToolCallEvents,
  eventMessageId,
  eventQueueId,
  eventReasoning,
  eventStartedCallId,
  eventText,
  streamToolCalls,
} from "./streamEvents";
import { groupAssistantMessages } from "./grouping";
import { sameToolCall } from "./identity";
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
  const visibleToolCalls = visible.flatMap((item) => toolParts(item));
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
    .map((item) =>
      streamMessage(item, events, outputs, visibleToolCalls, persistedSourceIds, startedCallIds),
    )
    .filter((item) => item.parts.length > 0);
  return groupAssistantMessages([...visible, ...live, ...pending]);
}
function streamMessage(
  item: DisplayQueue,
  events: DisplayEvent[],
  outputs: Map<string, DisplayMessage>,
  visibleToolCalls: Extract<TimelinePart, { type: "tool" }>[],
  persistedSourceIds: Set<string>,
  startedCallIds: Set<string>,
) {
  const streamEvents = events
    .filter((event) => eventQueueId(event) === item.id)
    .filter((event) => {
      const messageId = eventMessageId(event);
      return !messageId || !persistedSourceIds.has(messageId);
    });
  const content = streamEvents
    .map((event) => eventText(event, item.id))
    .filter((text) => text.length > 0)
    .join("");
  const reasoning = streamEvents
    .map((event) => eventReasoning(event, item.id))
    .filter((text) => text.length > 0)
    .join("");
  const toolCalls = streamToolCalls(currentToolCallEvents(streamEvents)).filter(
    (call) => !visibleToolCalls.some((part) => sameToolCall(part.call, call)),
  );
  return withParts(
    {
      content,
      createdAt: 0,
      id: -1,
      images: [],
      queueId: null,
      reasoning,
      role: "assistant",
      toolCalls,
    },
    `stream-${item.id.toString()}`,
    outputs,
    startedCallIds,
  );
}
function withParts(
  message: DisplayMessage,
  key: string,
  outputs: Map<string, DisplayMessage>,
  startedCallIds: Set<string>,
): TimelineMessage {
  return {
    id: message.id,
    key,
    role: message.role,
    content: message.content,
    createdAt: message.createdAt,
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
function toolParts(message: TimelineMessage) {
  return message.parts.filter(
    (part): part is Extract<TimelinePart, { type: "tool" }> => part.type === "tool",
  );
}
