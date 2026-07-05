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
  const visibleToolCalls = visible.flatMap((item) => item.toolCalls);
  const knownQueue = new Set(messages.map((item) => item.queueId));
  const syntheticUsers = queue
    .filter((item) => item.status === "pending" && !knownQueue.has(item.id))
    .map((item) =>
      synthetic("user", item.content, `queue-${item.id}`, outputs),
    );
  const streaming = queue
    .filter((item) => item.status === "running" || item.status === "paused")
    .map((item) => streamMessage(item, events, outputs, visibleToolCalls))
    .filter((item) => item.parts.length > 0);
  return groupAssistantMessages([...visible, ...syntheticUsers, ...streaming]);
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
  visibleToolCalls: Message["toolCalls"],
): ViewMessage {
  const streamEvents = events.filter((event) => eventQueueId(event) === item.id);
  const content = streamEvents
    .map((event) => eventText(event, item.id))
    .filter((text) => text.length > 0)
    .join("");
  return synthetic(
    "assistant",
    content,
    `stream-${item.id}`,
    outputs,
    streamToolCalls(currentToolCallEvents(streamEvents)).filter(
      (call) => !isFinalToolCallVisible(call, visibleToolCalls),
    ),
  );
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
  toolCalls: Message["toolCalls"] = [],
): ViewMessage {
  return withParts({
    id: -1,
    role,
    content,
    queueId: null,
    toolCalls,
    createdAt: 0,
    key,
    outputs,
  });
}

function eventText(event: StreamEvent, queueId: number) {
  if (eventQueueId(event) !== queueId) return "";
  if (!isRecord(event.payload)) return "";
  const kind = event.payload["kind"];
  if (kind !== undefined && kind !== "assistant_text_delta") return "";
  return typeof event.payload["text"] === "string" ? event.payload["text"] : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function eventQueueId(event: StreamEvent) {
  return isRecord(event.payload) && typeof event.payload["queueId"] === "number"
    ? event.payload["queueId"]
    : undefined;
}

function streamToolCalls(events: StreamEvent[]): Message["toolCalls"] {
  const calls = new Map<string, Message["toolCalls"][number]>();
  for (const event of events) {
    const delta = toolCallDelta(event);
    if (!delta) continue;
    const key =
      delta.id && delta.id.length > 0 ? delta.id : `index-${delta.index ?? 0}`;
    const current = calls.get(key);
    calls.set(key, {
      id: delta.id ?? current?.id ?? key,
      input: current?.input ?? {},
      inputText: appendDelta(current?.inputText ?? "", delta.args),
      name:
        appendDelta(
          current?.name === "tool" ? "" : current?.name,
          delta.name,
        ) || "tool",
      streaming: true,
    });
  }
  return [...calls.values()];
}

function currentToolCallEvents(events: StreamEvent[]) {
  const lastTextIndex = events.findLastIndex(
    (event) => eventText(event, eventQueueId(event) ?? -1).length > 0,
  );
  return events.slice(lastTextIndex + 1);
}

function isFinalToolCallVisible(
  call: Message["toolCalls"][number],
  visibleToolCalls: Message["toolCalls"],
) {
  return (
    visibleToolCalls.some((item) => item.id === call.id) ||
    (call.name === "tool" && visibleToolCalls.length > 0)
  );
}

function toolCallDelta(event: StreamEvent) {
  if (!isRecord(event.payload) || event.payload["kind"] !== "tool_call_delta") {
    return null;
  }
  const call = event.payload["call"];
  if (!isRecord(call)) return null;
  return {
    args: typeof call["args"] === "string" ? call["args"] : undefined,
    id: typeof call["id"] === "string" ? call["id"] : undefined,
    index: typeof call["index"] === "number" ? call["index"] : undefined,
    name: typeof call["name"] === "string" ? call["name"] : undefined,
  };
}

function appendDelta(current = "", delta?: string) {
  if (!delta) return current;
  if (current.length === 0 || delta.startsWith(current)) return delta;
  return current.endsWith(delta) ? current : current + delta;
}
