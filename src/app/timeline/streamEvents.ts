import type { DisplayEvent, DisplayToolCall } from "./types";
import type { StreamEvent } from "../../infrastructure/database/records/streamEvents";
import { countTokens } from "../../runtime/tokenizer";
export function displayStreamEvent(event: StreamEvent): DisplayEvent {
  const payload =
    event.kind === "tool_call_delta"
      ? { call: event.value }
      : event.kind === "tool_started"
        ? { callId: event.value }
        : { text: event.value };
  return {
    id: event.id,
    message: event.kind,
    payload: {
      kind: event.kind,
      queueId: event.queueId,
      ...payload,
      ...(event.messageId ? { messageId: event.messageId } : {}),
    },
  };
}
interface ToolCallAccumulator {
  freeform?: boolean;
  id?: string;
  index?: number;
  inputText: string;
  messageId?: string;
  name: string;
}
export function eventText(event: DisplayEvent, queueId: number) {
  return assistantDelta(event, queueId, "assistant_text_delta");
}
export function eventReasoning(event: DisplayEvent, queueId: number) {
  return assistantDelta(event, queueId, "assistant_reasoning_delta");
}
export function eventQueueId(event: DisplayEvent) {
  return isRecord(event.payload) && typeof event.payload["queueId"] === "number"
    ? event.payload["queueId"]
    : undefined;
}
export function eventMessageId(event: DisplayEvent) {
  return isRecord(event.payload) && typeof event.payload["messageId"] === "string"
    ? event.payload["messageId"]
    : undefined;
}
export function eventStartedCallId(event: DisplayEvent) {
  return isRecord(event.payload) &&
    event.payload["kind"] === "tool_started" &&
    typeof event.payload["callId"] === "string"
    ? event.payload["callId"]
    : undefined;
}
export function currentToolCallEvents(events: DisplayEvent[]) {
  const lastTextIndex = events.findLastIndex((event) => {
    const queueId = eventQueueId(event) ?? -1;
    return eventText(event, queueId).length > 0 || eventReasoning(event, queueId).length > 0;
  });
  return events.slice(lastTextIndex + 1);
}
export function streamToolCalls(events: DisplayEvent[]): DisplayToolCall[] {
  const calls: ToolCallAccumulator[] = [];
  for (const event of events) {
    const delta = toolCallDelta(event);
    if (!delta) {
      continue;
    }
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
    id: call.id ?? `i:${(call.index ?? order).toString()}`,
    index: call.index ?? order,
    input: {},
    inputTokens: countTokens(call.inputText),
    inputText: call.inputText,
    ...(call.messageId ? { messageId: call.messageId } : {}),
    name: call.name || "tool",
    ...(call.freeform ? { rawInput: call.inputText } : {}),
    streaming: true,
  }));
}
function matchesDelta(
  call: ToolCallAccumulator,
  delta: NonNullable<ReturnType<typeof toolCallDelta>>,
) {
  if (delta.id && call.id === delta.id) {
    return true;
  }
  return (
    delta.index !== undefined &&
    call.index === delta.index &&
    (!delta.id || !call.id || delta.id === call.id)
  );
}
function mergeCall(target: ToolCallAccumulator, source: ToolCallAccumulator) {
  target.freeform ??= source.freeform;
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
  target.freeform ??= delta.freeform;
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
  const { call } = event.payload;
  if (!isRecord(call)) {
    return null;
  }
  return {
    args: typeof call["args"] === "string" ? call["args"] : undefined,
    freeform: call["freeform"] === true ? true : undefined,
    id: typeof call["id"] === "string" ? call["id"] : undefined,
    index: typeof call["index"] === "number" ? call["index"] : undefined,
    messageId: eventMessageId(event),
    name: typeof call["name"] === "string" ? call["name"] : undefined,
  };
}
function appendArguments(current = "", delta?: string) {
  if (!delta) {
    return current;
  }
  if (current.length === 0 || delta.startsWith(current)) {
    return delta;
  }
  return current + delta;
}
function assistantDelta(
  event: DisplayEvent,
  queueId: number,
  kind: "assistant_reasoning_delta" | "assistant_text_delta",
) {
  if (eventQueueId(event) !== queueId || !isRecord(event.payload)) {
    return "";
  }
  if (event.payload["kind"] !== kind) {
    return "";
  }
  return typeof event.payload["text"] === "string" ? event.payload["text"] : "";
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
