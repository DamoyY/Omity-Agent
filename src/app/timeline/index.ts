import { sameToolCall } from "./identity";
import { groupAssistantMessages } from "./grouping";
import {
  currentToolCallEvents,
  eventMessageId,
  eventQueueId,
  eventReasoning,
  eventStartedCallId,
  eventText,
  streamToolCalls,
} from "./streamEvents";
import type {
  DisplayEvent,
  DisplayMessage,
  DisplayQueue,
  DisplayRole,
  TimelineMessage,
  TimelinePart,
} from "./types";

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

export function buildTimeline(
  messages: DisplayMessage[],
  queue: DisplayQueue[],
  events: DisplayEvent[],
): TimelineMessage[] {
  const outputs = new Map(
    messages.flatMap((item) =>
      item.role === "tool" && item.toolCallId
        ? [[item.toolCallId, item] as const]
        : [],
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
    .map((item) =>
      withParts(item, `message-${item.id.toString()}`, outputs, startedCallIds),
    );
  const visibleToolCalls = visible.flatMap((item) => toolParts(item));
  const persistedSourceIds = new Set(
    messages.map((item) => item.sourceId).filter((id) => id !== undefined),
  );
  const knownQueue = new Set(messages.map((item) => item.queueId));
  const pending = queue
    .filter((item) => item.status === "pending" && !knownQueue.has(item.id))
    .map((item) =>
      synthetic("user", item.content, `queue-${item.id.toString()}`),
    );
  const live = queue
    .filter((item) => item.status === "running" || item.status === "paused")
    .filter((item) => item.userMessageId !== null)
    .map((item) =>
      streamMessage(
        item,
        events,
        outputs,
        visibleToolCalls,
        persistedSourceIds,
        startedCallIds,
      ),
    )
    .filter((item) => item.parts.length > 0);
  return groupAssistantMessages([...visible, ...pending, ...live]);
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
      id: -1,
      role: "assistant",
      content,
      reasoning,
      images: [],
      queueId: null,
      toolCalls,
      createdAt: 0,
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
        ? [{ type: "reasoning", content: message.reasoning } as const]
        : []),
      ...(message.content.trim()
        ? [{ type: "content", content: message.content } as const]
        : []),
      ...message.toolCalls.map((call) => ({
        type: "tool" as const,
        call,
        output: outputs.get(call.id),
        ...(startedCallIds.has(call.id) ? { started: true } : {}),
      })),
    ],
  };
}

function synthetic(
  role: DisplayRole,
  content: string,
  key: string,
): TimelineMessage {
  return {
    id: -1,
    role,
    content,
    createdAt: 0,
    key,
    parts: content.trim() ? [{ type: "content", content }] : [],
  };
}

function toolParts(message: TimelineMessage) {
  return message.parts.filter(
    (part): part is Extract<TimelinePart, { type: "tool" }> =>
      part.type === "tool",
  );
}
