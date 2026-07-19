import type {
  DisplayEvent,
  DisplayMessage,
  DisplayToolCall,
  TimelineMessage,
  TimelinePart,
} from "./types";
import { countTokens } from "../../runtime/tokenizer";

type TextPart = {
  [Kind in "assistant_reasoning_delta" | "assistant_text_delta"]: {
    content: string;
    kind: Kind;
  };
}["assistant_reasoning_delta" | "assistant_text_delta"];
interface ToolPart {
  args: string;
  freeform?: boolean;
  id?: string;
  index: number;
  kind: "tool_call_delta";
  name: string;
}
type Part = TextPart | ToolPart;
interface StreamMessage {
  firstEventId: number;
  messageId: string;
  order: string[];
  parts: Map<string, Part>;
}
export function displayStreamEvent(event: DisplayEvent): DisplayEvent {
  return event;
}
export function eventQueueId(event: DisplayEvent) {
  return event.queueId;
}
export function eventMessageId(event: DisplayEvent) {
  return event.messageId;
}
export function eventStartedCallId(event: DisplayEvent) {
  return event.kind === "tool_started" ? event.value : undefined;
}
export function streamTimelineMessages(
  events: DisplayEvent[],
  outputs: Map<string, DisplayMessage>,
  startedCallIds: Set<string>,
): TimelineMessage[] {
  const messages = new Map<string, StreamMessage>();
  for (const event of events) {
    if (event.kind !== "tool_started" && event.kind !== "user_appended") {
      let message = messages.get(event.messageId);
      if (!message) {
        message = {
          firstEventId: event.id,
          messageId: event.messageId,
          order: [],
          parts: new Map(),
        };
        messages.set(event.messageId, message);
      }
      let part = message.parts.get(event.partId);
      if (!part) {
        part = createPart(event);
        message.parts.set(event.partId, part);
        message.order.push(event.partId);
      } else {
        mergePart(part, event);
      }
    }
  }
  return [...messages.values()].map((message) => timelineMessage(message, outputs, startedCallIds));
}
function createPart(
  event: Exclude<DisplayEvent, { kind: "tool_started" | "user_appended" }>,
): Part {
  if (event.kind === "tool_call_delta") {
    return {
      args: event.value.argumentsDelta ?? "",
      ...(event.value.freeform ? { freeform: true } : {}),
      ...(event.value.idDelta ? { id: event.value.idDelta } : {}),
      index: event.value.index,
      kind: event.kind,
      name: event.value.nameDelta ?? "",
    };
  }
  return { content: event.value, kind: event.kind };
}
function mergePart(
  part: Part,
  event: Exclude<DisplayEvent, { kind: "tool_started" | "user_appended" }>,
) {
  if (part.kind !== event.kind) {
    throw new Error(`流片段 ${event.partId} 的类型发生变化`);
  }
  if (part.kind === "tool_call_delta" && event.kind === "tool_call_delta") {
    if (part.index !== event.value.index) {
      throw new Error(`工具流片段 ${event.partId} 的索引发生变化`);
    }
    part.args += event.value.argumentsDelta ?? "";
    part.freeform ??= event.value.freeform;
    part.id = appendDelta(part.id, event.value.idDelta);
    part.name += event.value.nameDelta ?? "";
  } else if (part.kind !== "tool_call_delta" && event.kind !== "tool_call_delta") {
    part.content += event.value;
  }
}
function timelineMessage(
  message: StreamMessage,
  outputs: Map<string, DisplayMessage>,
  startedCallIds: Set<string>,
): TimelineMessage {
  const parts = message.order.flatMap((partId): TimelinePart[] => {
    const part = message.parts.get(partId);
    if (!part) {
      throw new Error(`流消息缺少片段：${partId}`);
    }
    if (part.kind === "assistant_reasoning_delta") {
      return part.content.trim() ? [{ content: part.content, type: "reasoning" }] : [];
    }
    if (part.kind === "assistant_text_delta") {
      return part.content.trim() ? [{ content: part.content, type: "content" }] : [];
    }
    const callId = part.id ?? `stream:${message.messageId}:${partId}`;
    const output = outputs.get(callId);
    const call = displayCall(part, message.messageId, partId, output === undefined);
    return [
      {
        call,
        output,
        type: "tool",
        ...(startedCallIds.has(call.id) ? { started: true } : {}),
      },
    ];
  });
  return {
    content: parts.flatMap((part) => (part.type === "content" ? [part.content] : [])).join(""),
    createdAt: 0,
    id: -1,
    key: `stream-${message.messageId}-${message.firstEventId.toString()}`,
    parts,
    role: "assistant",
  };
}
function displayCall(
  part: ToolPart,
  messageId: string,
  partId: string,
  streaming: boolean,
): DisplayToolCall {
  const inputText = part.args;
  return {
    id: part.id ?? `stream:${messageId}:${partId}`,
    index: part.index,
    input: {},
    inputText,
    inputTokens: countTokens(inputText),
    messageId,
    name: part.name || "tool",
    ...(streaming ? { streaming: true } : {}),
    ...(part.freeform ? { rawInput: inputText } : {}),
  };
}
function appendDelta(current: string | undefined, incoming?: string) {
  const value = (current ?? "") + (incoming ?? "");
  return value || undefined;
}
