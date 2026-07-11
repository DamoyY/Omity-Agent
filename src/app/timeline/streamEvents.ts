import type { DisplayEvent, DisplayToolCall } from "./types";

type ToolCallAccumulator = {
  id?: string;
  index?: number;
  inputText: string;
  messageId?: string;
  name: string;
};

export function eventText(event: DisplayEvent, queueId: number) {
  if (eventQueueId(event) !== queueId) return "";
  if (!isRecord(event.payload)) return "";
  const kind = event.payload["kind"];
  if (kind !== undefined && kind !== "assistant_text_delta") return "";
  return typeof event.payload["text"] === "string" ? event.payload["text"] : "";
}

export function eventQueueId(event: DisplayEvent) {
  return isRecord(event.payload) && typeof event.payload["queueId"] === "number"
    ? event.payload["queueId"]
    : undefined;
}

export function eventMessageId(event: DisplayEvent) {
  return isRecord(event.payload) &&
    typeof event.payload["messageId"] === "string"
    ? event.payload["messageId"]
    : undefined;
}

export function currentToolCallEvents(events: DisplayEvent[]) {
  const lastTextIndex = events.findLastIndex(
    (event) => eventText(event, eventQueueId(event) ?? -1).length > 0,
  );
  return events.slice(lastTextIndex + 1);
}

export function streamToolCalls(events: DisplayEvent[]): DisplayToolCall[] {
  const calls: ToolCallAccumulator[] = [];
  for (const event of events) {
    const delta = toolCallDelta(event);
    if (!delta) continue;
    const matches = calls.filter((call) => matchesDelta(call, delta));
    let current = matches.shift();
    if (!current) {
      current = { inputText: "", name: "" };
      calls.push(current);
    }
    for (const duplicate of matches) {
      mergeCall(current, duplicate);
      calls.splice(calls.indexOf(duplicate), 1);
    }
    mergeDelta(current, delta);
  }
  return calls.map((call, order) => ({
    id: call.id ?? `i:${call.index ?? order}`,
    index: call.index ?? order,
    input: {},
    inputText: call.inputText,
    ...(call.messageId ? { messageId: call.messageId } : {}),
    name: call.name || "tool",
    streaming: true,
  }));
}

function matchesDelta(
  call: ToolCallAccumulator,
  delta: NonNullable<ReturnType<typeof toolCallDelta>>,
) {
  if (delta.id && call.id === delta.id) return true;
  return (
    delta.index !== undefined &&
    call.index === delta.index &&
    (!delta.id || !call.id || delta.id === call.id)
  );
}

function mergeCall(target: ToolCallAccumulator, source: ToolCallAccumulator) {
  target.id ??= source.id;
  target.index ??= source.index;
  target.messageId ??= source.messageId;
  target.inputText = appendArguments(target.inputText, source.inputText);
  target.name += source.name;
}

function mergeDelta(
  target: ToolCallAccumulator,
  delta: NonNullable<ReturnType<typeof toolCallDelta>>,
) {
  target.id ??= delta.id;
  target.index ??= delta.index;
  target.messageId ??= delta.messageId;
  target.inputText = appendArguments(target.inputText, delta.args);
  target.name += delta.name ?? "";
}

function toolCallDelta(event: DisplayEvent) {
  if (!isRecord(event.payload) || event.payload["kind"] !== "tool_call_delta") {
    return null;
  }
  const call = event.payload["call"];
  if (!isRecord(call)) return null;
  return {
    args: typeof call["args"] === "string" ? call["args"] : undefined,
    id: typeof call["id"] === "string" ? call["id"] : undefined,
    index: typeof call["index"] === "number" ? call["index"] : undefined,
    messageId: eventMessageId(event),
    name: typeof call["name"] === "string" ? call["name"] : undefined,
  };
}

function appendArguments(current = "", delta?: string) {
  if (!delta) return current;
  if (current.length === 0 || delta.startsWith(current)) return delta;
  return current + delta;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
