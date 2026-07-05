import type { Message, QueueItem, StreamEvent } from "../services/client";

export type ViewMessage = Message & {
  key: string;
  outputs: Map<string, Message>;
  parts: ViewPart[];
};

export type ViewPart =
  | { type: "content"; content: string }
  | { type: "tool"; call: Message["toolCalls"][number] };

export function buildView(
  messages: Message[],
  queue: QueueItem[],
  events: StreamEvent[],
): ViewMessage[] {
  const outputs = new Map(
    messages
      .filter((item) => item.role === "tool" && item.toolCallId)
      .map((item) => [item.toolCallId!, item]),
  );
  const visible = messages
    .filter((item) => item.role !== "tool")
    .map((item) => withParts({ ...item, key: `message-${item.id}`, outputs }));
  const knownQueue = new Set(messages.map((item) => item.queueId));
  const syntheticUsers = queue
    .filter((item) => item.status === "pending" && !knownQueue.has(item.id))
    .map((item) =>
      synthetic("user", item.content, `queue-${item.id}`, outputs),
    );
  const streaming = queue
    .filter((item) => item.status === "running" || item.status === "paused")
    .map((item) => streamMessage(item, events, outputs))
    .filter((item) => item.content.length > 0);
  return [...groupAssistantMessages(visible), ...syntheticUsers, ...streaming];
}

function groupAssistantMessages(messages: ViewMessage[]): ViewMessage[] {
  const result: ViewMessage[] = [];
  let currentAssistant: ViewMessage | undefined;
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
    currentAssistant.content = [currentAssistant.content, item.content]
      .filter((content) => content.trim().length > 0)
      .join("\n\n");
    currentAssistant.toolCalls.push(...item.toolCalls);
    currentAssistant.parts.push(...item.parts);
    currentAssistant.id = item.id;
  }
  return result;
}

function streamMessage(
  item: QueueItem,
  events: StreamEvent[],
  outputs: Map<string, Message>,
): ViewMessage {
  const content = events
    .map((event) => eventText(event, item.id))
    .filter((text) => text.length > 0)
    .join("");
  return synthetic("assistant", content, `stream-${item.id}`, outputs);
}

function withParts(message: Omit<ViewMessage, "parts">): ViewMessage {
  return {
    ...message,
    parts: [
      ...(message.content.trim()
        ? [{ type: "content", content: message.content } as const]
        : []),
      ...message.toolCalls.map((call) => ({ type: "tool" as const, call })),
    ],
  };
}

function synthetic(
  role: Message["role"],
  content: string,
  key: string,
  outputs: Map<string, Message>,
): ViewMessage {
  return {
    id: -1,
    role,
    content,
    queueId: null,
    toolCalls: [],
    createdAt: 0,
    key,
    outputs,
    parts: content.trim() ? [{ type: "content", content }] : [],
  };
}

function eventText(event: StreamEvent, queueId: number) {
  if (!isRecord(event.payload) || event.payload["queueId"] !== queueId)
    return "";
  return typeof event.payload["text"] === "string" ? event.payload["text"] : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
