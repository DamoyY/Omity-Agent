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
  partIndex?: number;
  trailingNewlines: number;
}

export function contentToText(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .map((part: unknown) => {
        if (typeof part === "string") return part;
        if (!isRecord(part)) return "";
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
  if (outputParts.length > 0) return joinReasoningParts(outputParts);

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
    trailingNewlines: 0,
  };
}

export function streamedMessageReasoning(
  message: BaseMessage,
  state: ReasoningStreamState,
) {
  const summary = readReasoningSummary(message.additional_kwargs["reasoning"]);
  if (summary?.id && summary.id !== state.itemId) {
    state.breakBeforeNext = state.hasText;
    state.itemId = summary.id;
    state.partIndex = undefined;
  }
  if (summary && summary.parts.length > 0) {
    return summary.parts
      .map((part) => appendReasoningPart(part, state))
      .join("");
  }

  const reasoning = contentBlocksToReasoning(message.contentBlocks);
  return reasoning ? appendReasoningPart({ text: reasoning }, state) : "";
}

export function contentBlocksToReasoning(content: unknown): string {
  if (!Array.isArray(content)) return "";
  return joinReasoningParts(
    content.flatMap((part) =>
      isRecord(part) &&
      part["type"] === "reasoning" &&
      typeof part["reasoning"] === "string"
        ? [{ text: part["reasoning"] }]
        : [],
    ),
  );
}

function appendReasoningPart(part: ReasoningPart, state: ReasoningStreamState) {
  const changedPart =
    part.index !== undefined &&
    state.partIndex !== undefined &&
    part.index !== state.partIndex;
  const needsBreak = state.hasText && (state.breakBeforeNext || changedPart);
  const prefix = needsBreak
    ? missingNewlines(state.trailingNewlines, leadingNewlines(part.text))
    : "";
  const appended = prefix + part.text;
  state.breakBeforeNext = false;
  state.hasText ||= appended.length > 0;
  state.trailingNewlines = updatedTrailingNewlines(
    state.trailingNewlines,
    appended,
  );
  if (part.index !== undefined) state.partIndex = part.index;
  return appended;
}

function joinReasoningParts(parts: ReasoningPart[]) {
  const state = createReasoningStreamState();
  return parts
    .map((part, index) => {
      if (index > 0) state.breakBeforeNext = true;
      return appendReasoningPart(part, state);
    })
    .join("");
}

function readReasoningSummary(value: unknown): ReasoningSummary | null {
  if (!isRecord(value) || value["type"] !== "reasoning") return null;
  const summary = value["summary"];
  return {
    ...(typeof value["id"] === "string" ? { id: value["id"] } : {}),
    parts: Array.isArray(summary)
      ? summary.flatMap((part) => {
          if (!isRecord(part) || typeof part["text"] !== "string") return [];
          return [
            {
              text: part["text"],
              ...(typeof part["index"] === "number"
                ? { index: part["index"] }
                : {}),
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
