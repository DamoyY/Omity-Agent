import { sameToolCall } from "./identity";
import {
  currentToolCallEvents,
  eventMessageId,
  eventQueueId,
  eventReasoning,
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
  const visible = messages
    .filter((item) => item.role !== "tool")
    .map((item) => withParts(item, `message-${item.id.toString()}`, outputs));
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
      ),
    )
    .filter((item) => item.parts.length > 0);
  return groupAssistantMessages([...visible, ...pending, ...live]);
}

function groupAssistantMessages(messages: TimelineMessage[]) {
  const result: TimelineMessage[] = [];
  let currentAssistant: TimelineMessage | undefined;
  for (const item of messages) {
    if (item.role !== "assistant") {
      currentAssistant = undefined;
      result.push(item);
      continue;
    }
    if (!currentAssistant) {
      currentAssistant = item;
      result.push(item);
      continue;
    }
    mergeAssistant(currentAssistant, item);
    currentAssistant.id = item.id;
  }
  return result;
}

function mergeAssistant(target: TimelineMessage, source: TimelineMessage) {
  target.content = [target.content, source.content]
    .filter((content) => content.trim().length > 0)
    .join("\n\n");
  for (const part of source.parts) {
    if (part.type !== "tool") {
      target.parts.push(part);
      continue;
    }
    if (toolParts(target).some((item) => sameToolCall(item.call, part.call))) {
      continue;
    }
    target.parts.push(part);
  }
  if (source.usage) target.usage = source.usage;
}

function streamMessage(
  item: DisplayQueue,
  events: DisplayEvent[],
  outputs: Map<string, DisplayMessage>,
  visibleToolCalls: Extract<TimelinePart, { type: "tool" }>[],
  persistedSourceIds: Set<string>,
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
  );
}

function withParts(
  message: DisplayMessage,
  key: string,
  outputs: Map<string, DisplayMessage>,
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
