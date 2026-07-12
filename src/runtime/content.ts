import type { BaseMessage } from "@langchain/core/messages";

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
  return contentBlocksToReasoning(message.contentBlocks);
}

export function contentBlocksToReasoning(content: unknown): string {
  if (!Array.isArray(content)) return "";
  return content
    .flatMap((part) =>
      isRecord(part) &&
      part["type"] === "reasoning" &&
      typeof part["reasoning"] === "string"
        ? [part["reasoning"]]
        : [],
    )
    .join("\n\n");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
