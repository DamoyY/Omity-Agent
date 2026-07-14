import type { BaseMessage } from "@langchain/core/messages";

interface ReasoningPart {
  index?: number;
  text: string;
}
interface ReasoningSummary {
  id?: string;
  parts: ReasoningPart[];
}
export interface ReasoningStreamState {
  breakBeforeNext: boolean;
  hasText: boolean;
  itemId?: string;
  lastCharacter: string;
  partIndex?: number;
  pendingAsterisks: string;
  trailingNewlines: number;
}
export function contentToText(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .map((part: unknown) => {
        if (typeof part === "string") {
          return part;
        }
        if (!isRecord(part)) {
          return "";
        }
        return typeof part["text"] === "string" ? part["text"] : "";
      })
      .join("");
  }
  return "";
}
export function messageReasoning(message: BaseMessage) {
  const metadata: unknown = message.response_metadata;
  const output = isRecord(metadata) ? metadata["output"] : undefined;
  const outputParts = Array.isArray(output)
    ? output.flatMap((item) => readReasoningSummary(item)?.parts ?? [])
    : [];
  if (outputParts.length > 0) {
    return joinReasoningParts(outputParts);
  }
  const summary = readReasoningSummary(message.additional_kwargs["reasoning"]);
  if (summary && summary.parts.length > 0) {
    return joinReasoningParts(summary.parts);
  }
  return contentBlocksToReasoning(message.contentBlocks);
}
export function createReasoningStreamState(): ReasoningStreamState {
  return {
    breakBeforeNext: false,
    hasText: false,
    lastCharacter: "",
    pendingAsterisks: "",
    trailingNewlines: 0,
  };
}
export function streamedMessageReasoning(message: BaseMessage, state: ReasoningStreamState) {
  const summary = readReasoningSummary(message.additional_kwargs["reasoning"]);
  if (summary?.id && summary.id !== state.itemId) {
    state.breakBeforeNext = state.hasText;
    state.itemId = summary.id;
    state.partIndex = undefined;
  }
  if (summary && summary.parts.length > 0) {
    return summary.parts.map((part) => appendReasoningPart(part, state)).join("");
  }
  const reasoning = contentBlocksToReasoning(message.contentBlocks);
  return reasoning ? appendReasoningPart({ text: reasoning }, state) : flushAsterisks(state);
}
export function contentBlocksToReasoning(content: unknown): string {
  if (!Array.isArray(content)) {
    return "";
  }
  return joinReasoningParts(
    content.flatMap((part) =>
      isRecord(part) && part["type"] === "reasoning" && typeof part["reasoning"] === "string"
        ? [{ text: part["reasoning"] }]
        : [],
    ),
  );
}
function appendReasoningPart(part: ReasoningPart, state: ReasoningStreamState) {
  const changedPart =
    part.index !== undefined && state.partIndex !== undefined && part.index !== state.partIndex;
  const needsBreak = state.hasText && (state.breakBeforeNext || changedPart);
  let output = needsBreak ? flushAsterisks(state) : "";
  const prefix = needsBreak
    ? missingNewlines(state.trailingNewlines, leadingNewlines(part.text))
    : "";
  output += prefix;
  updateStreamTail(state, prefix);
  state.breakBeforeNext = false;
  if (part.index !== undefined) {
    state.partIndex = part.index;
  }
  return output + appendReasoningText(part.text, state);
}
function joinReasoningParts(parts: ReasoningPart[]) {
  const state = createReasoningStreamState();
  const text = parts
    .map((part, index) => {
      if (index > 0) {
        state.breakBeforeNext = true;
      }
      return appendReasoningPart(part, state);
    })
    .join("");
  return text + flushAsterisks(state);
}
function appendReasoningText(text: string, state: ReasoningStreamState) {
  const combined = state.pendingAsterisks + text;
  const pending = /\**$/.exec(combined)?.[0] ?? "";
  const complete = combined.slice(0, combined.length - pending.length);
  state.pendingAsterisks = pending;
  const context = state.lastCharacter + complete;
  const normalized = context
    .replace(/(?<character>\S)\*{4}(?=\S)/g, "$<character>**\n\n**")
    .slice(state.lastCharacter.length);
  updateStreamTail(state, normalized);
  return normalized;
}
function flushAsterisks(state: ReasoningStreamState) {
  const pending = state.pendingAsterisks;
  state.pendingAsterisks = "";
  updateStreamTail(state, pending);
  return pending;
}
function readReasoningSummary(value: unknown): ReasoningSummary | null {
  if (!isRecord(value) || value["type"] !== "reasoning") {
    return null;
  }
  const { summary } = value;
  return {
    ...(typeof value["id"] === "string" ? { id: value["id"] } : {}),
    parts: Array.isArray(summary)
      ? summary.flatMap((part) => {
          if (!isRecord(part) || typeof part["text"] !== "string") {
            return [];
          }
          return [
            {
              text: part["text"],
              ...(typeof part["index"] === "number" ? { index: part["index"] } : {}),
            },
          ];
        })
      : [],
  };
}
function missingNewlines(trailing: number, leading: number) {
  return "\n".repeat(Math.max(0, 2 - trailing - leading));
}
function leadingNewlines(value: string) {
  return /^\n*/.exec(value)?.[0].length ?? 0;
}
function updatedTrailingNewlines(previous: number, appended: string) {
  const trailing = /\n*$/.exec(appended)?.[0].length ?? 0;
  return trailing === appended.length ? previous + trailing : trailing;
}
function updateStreamTail(state: ReasoningStreamState, appended: string) {
  if (!appended) {
    return;
  }
  state.hasText = true;
  state.lastCharacter = appended.at(-1) ?? state.lastCharacter;
  state.trailingNewlines = updatedTrailingNewlines(state.trailingNewlines, appended);
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
