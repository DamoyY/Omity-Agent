import type { DisplayEvent, DisplayToolCall } from "./types";

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

export function currentToolCallEvents(events: DisplayEvent[]) {
  const lastTextIndex = events.findLastIndex(
    (event) => eventText(event, eventQueueId(event) ?? -1).length > 0,
  );
  return events.slice(lastTextIndex + 1);
}

export function streamToolCalls(events: DisplayEvent[]): DisplayToolCall[] {
  const calls = new Map<string, DisplayToolCall>();
  for (const event of events) {
    const delta = toolCallDelta(event);
    if (!delta) continue;
    const key = delta.id && delta.id.length > 0 ? delta.id : `i:${delta.index}`;
    const current = calls.get(key);
    calls.set(key, {
      id: delta.id ?? current?.id ?? key,
      index: delta.index ?? current?.index ?? 0,
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
    name: typeof call["name"] === "string" ? call["name"] : undefined,
  };
}

function appendDelta(current = "", delta?: string) {
  if (!delta) return current;
  if (current.length === 0 || delta.startsWith(current)) return delta;
  return current.endsWith(delta) ? current : current + delta;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
