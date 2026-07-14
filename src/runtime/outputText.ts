import type { ContentBlock, MessageContent } from "@langchain/core/messages";

export interface ToolTextContent {
  text: string;
  isError: boolean;
  normalized: MessageContent;
  replaceText: (replacement: string) => MessageContent;
}
export function inspectToolTextContent(content: MessageContent): ToolTextContent | null {
  const parsed = parseMcpContent(content);
  if (parsed === null) {
    return null;
  }
  const { value } = parsed;
  if (typeof value === "string") {
    return {
      isError: parsed.isError,
      normalized: value,
      replaceText: (replacement) => replacement,
      text: value,
    };
  }
  const text = value.map(blockText).join("");
  const hasNonText = value.some((block) => blockText(block) === null);
  return {
    isError: parsed.isError,
    normalized: hasNonText ? asContentBlocks(value) : text,
    replaceText: (replacement) =>
      hasNonText ? replaceTextBlocks(value, replacement) : replacement,
    text,
  };
}
function parseMcpContent(
  content: MessageContent,
): { value: string | unknown[]; isError: boolean } | null {
  if (typeof content !== "string") {
    return { isError: false, value: content };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(content) as unknown;
  } catch {
    return { isError: false, value: content };
  }
  if (Array.isArray(parsed)) {
    return { isError: false, value: parsed };
  }
  if (isRecord(parsed) && Array.isArray(parsed["content"])) {
    return { isError: parsed["isError"] === true, value: parsed["content"] };
  }
  if (isTextBlock(parsed)) {
    return { isError: false, value: [parsed] };
  }
  return { isError: false, value: content };
}
function replaceTextBlocks(blocks: unknown[], replacement: string) {
  const firstText = blocks.findIndex((block) => blockText(block) !== null);
  if (firstText === -1) {
    return asContentBlocks([{ text: replacement, type: "text" }, ...blocks]);
  }
  return asContentBlocks(
    blocks.flatMap((block, index) => {
      if (blockText(block) === null) {
        return [block];
      }
      return index === firstText ? [{ text: replacement, type: "text" }] : [];
    }),
  );
}
function blockText(block: unknown): string | null {
  if (typeof block === "string") {
    return block;
  }
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
  return value.map((block): ContentBlock => {
    if (typeof block === "string") {
      return { text: block, type: "text" };
    }
    if (!isContentBlock(block)) {
      throw new Error("MCP 内容块缺少字符串 type");
    }
    return block;
  });
}
function isContentBlock(value: unknown): value is ContentBlock {
  return isRecord(value) && typeof value["type"] === "string";
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
