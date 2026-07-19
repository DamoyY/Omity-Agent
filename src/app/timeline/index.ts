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
  optimistic: TimelineMessage[] = [],
): TimelineMessage[] {
  const outputs = new Map(
    messages.flatMap((item) =>
      item.role === "tool" && item.toolCallId ? [[item.toolCallId, item] as const] : [],
    ),
  );
  const startedCallIds = new Set(
    events.flatMap((event) => {
      const callId = eventStartedCallId(event);
      return callId && !outputs.has(callId) ? [callId] : [];
    }),
  );
  const visible = messages
    .filter((item) => item.role !== "tool")
    .map((item) => withParts(item, `message-${item.id.toString()}`, outputs, startedCallIds));
  const persistedSourceIds = new Set(
    messages.map((item) => item.sourceId).filter((id) => id !== undefined),
  );
  const knownQueue = new Set(messages.map((item) => item.queueId));
  const pending = new Map(
    queue
      .filter((item) => item.status === "pending" && !knownQueue.has(item.id))
      .map(
        (item) =>
          [
            item.id,
            synthetic("user", item.content, `queue-${item.id.toString()}`, item.afterEventId),
          ] as const,
      ),
  );
  const activeQueueIds = new Set(
    queue
      .filter((item) => item.status === "running" || item.status === "paused")
      .filter((item) => item.userMessageId !== null)
      .map((item) => item.id),
  );
  const liveEvents = events.filter(
    (event) =>
      (event.kind === "user_appended" && pending.has(event.queueId)) ||
      (activeQueueIds.has(eventQueueId(event)) && !persistedSourceIds.has(eventMessageId(event))),
  );
  const live = timelineTail(liveEvents, pending, optimistic, outputs, startedCallIds);
  return groupAssistantMessages([...visible, ...live]);
}
function timelineTail(
  events: DisplayEvent[],
  pending: Map<number, TimelineMessage>,
  optimistic: TimelineMessage[],
  outputs: Map<string, DisplayMessage>,
  startedCallIds: Set<string>,
) {
  const result: TimelineMessage[] = [];
  let stream: DisplayEvent[] = [];
  const optimisticInsertions: TimelineInsertion[] = optimistic.map((message) => ({ message }));
  const pendingInsertions: TimelineInsertion[] = [...pending].flatMap(([queueId, message]) =>
    message.afterEventId === undefined ? [] : [{ message, queueId }],
  );
  const insertions: TimelineInsertion[] = [...optimisticInsertions, ...pendingInsertions].toSorted(
    (left, right) => requireAfterEventId(left.message) - requireAfterEventId(right.message),
  );
  const flushStream = () => {
    result.push(...streamTimelineMessages(stream, outputs, startedCallIds));
    stream = [];
  };
  for (const event of events) {
    while (insertions.length > 0 && requireAfterEventId(insertions[0]?.message) < event.id) {
      flushStream();
      appendInsertion(result, pending, requireInsertion(insertions.shift()));
    }
    if (event.kind === "user_appended") {
      const message = pending.get(event.queueId);
      if (message) {
        flushStream();
        result.push(message);
        pending.delete(event.queueId);
        const insertionIndex = insertions.findIndex(({ queueId }) => queueId === event.queueId);
        if (insertionIndex !== -1) {
          insertions.splice(insertionIndex, 1);
        }
      }
    } else {
      stream.push(event);
    }
  }
  flushStream();
  for (const insertion of insertions) {
    appendInsertion(result, pending, insertion);
  }
  result.push(...pending.values());
  return result;
}
interface TimelineInsertion {
  message: TimelineMessage;
  queueId?: number;
}
function requireAfterEventId(message: TimelineMessage | undefined) {
  if (message?.afterEventId === undefined) {
    throw new Error("乐观消息缺少流事件边界");
  }
  return message.afterEventId;
}
function requireInsertion(insertion: TimelineInsertion | undefined) {
  if (!insertion) {
    throw new Error("乐观消息不存在");
  }
  return insertion;
}
function appendInsertion(
  result: TimelineMessage[],
  pending: Map<number, TimelineMessage>,
  insertion: TimelineInsertion,
) {
  result.push(insertion.message);
  if (insertion.queueId !== undefined) {
    pending.delete(insertion.queueId);
  }
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
function synthetic(
  role: DisplayRole,
  content: string,
  key: string,
  afterEventId?: number,
): TimelineMessage {
  return {
    ...(afterEventId === undefined ? {} : { afterEventId }),
    content,
    createdAt: 0,
    id: -1,
    key,
    parts: content.trim() ? [{ content, type: "content" }] : [],
    role,
  };
}
