import type { ContentBlock, MessageContent } from "@langchain/core/messages";

export interface ToolTextContent {
  text: string;
  isError: boolean;
  normalized: MessageContent;
  replaceText: (replacement: string) => MessageContent;
}

export function inspectToolTextContent(
  content: MessageContent,
): ToolTextContent | null {
  const parsed = parseMcpContent(content);
  if (parsed === null) return null;
  const value = parsed.value;
  if (typeof value === "string") {
    return {
      text: value,
      isError: parsed.isError,
      normalized: value,
      replaceText: (replacement) => replacement,
    };
  }
  const text = value.map(blockText).join("");
  const hasNonText = value.some((block) => blockText(block) === null);
  return {
    text,
    isError: parsed.isError,
    normalized: hasNonText ? asContentBlocks(value) : text,
    replaceText: (replacement) =>
      hasNonText ? replaceTextBlocks(value, replacement) : replacement,
  };
}

function parseMcpContent(
  content: MessageContent,
): { value: string | unknown[]; isError: boolean } | null {
  if (typeof content !== "string") return { value: content, isError: false };
  let parsed: unknown;
  try {
    parsed = JSON.parse(content) as unknown;
  } catch {
    return { value: content, isError: false };
  }
  if (Array.isArray(parsed)) return { value: parsed, isError: false };
  if (isRecord(parsed) && Array.isArray(parsed["content"])) {
    return { value: parsed["content"], isError: parsed["isError"] === true };
  }
  if (isTextBlock(parsed)) return { value: [parsed], isError: false };
  return { value: content, isError: false };
}

function replaceTextBlocks(blocks: unknown[], replacement: string) {
  const firstText = blocks.findIndex((block) => blockText(block) !== null);
  if (firstText < 0) {
    return asContentBlocks([{ type: "text", text: replacement }, ...blocks]);
  }
  return asContentBlocks(
    blocks.flatMap((block, index) => {
      if (blockText(block) === null) return [block];
      return index === firstText ? [{ type: "text", text: replacement }] : [];
    }),
  );
}

function blockText(block: unknown): string | null {
  if (typeof block === "string") return block;
  return isTextBlock(block) ? block.text : null;
}

function isTextBlock(value: unknown): value is { text: string } {
  return (
    isRecord(value) &&
    (value["type"] === "text" || value["type"] === "input_text") &&
    typeof value["text"] === "string"
  );
}

function asContentBlocks(value: unknown[]) {
  return value as ContentBlock[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
