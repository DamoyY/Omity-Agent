import { ToolMessage, type BaseMessage, type ContentBlock } from "@langchain/core/messages";
import { createMiddleware } from "langchain";
import type { ModelApi } from "../types";
export interface ToolImage {
  src: string;
  mimeType: string;
}
export function createModelImageMiddleware(api: ModelApi) {
  return createMiddleware({
    name: "model-images",
    wrapModelCall: (request, handler) =>
      handler({
        ...request,
        messages: prepareModelImageMessages(request.messages, api),
      }),
  });
}
export function prepareModelImageMessages(messages: BaseMessage[], api: ModelApi): BaseMessage[] {
  return api === "responses"
    ? prepareResponsesMessages(messages)
    : prepareCompletionsMessages(messages);
}
export function extractToolImages(content: unknown): ToolImage[] {
  const parsed = parseStructuredString(content);
  if (parsed !== content) return extractToolImages(parsed);
  if (Array.isArray(content)) return content.flatMap(extractToolImages);
  if (!isRecord(content)) return [];
  if (Array.isArray(content["content"])) {
    return extractToolImages(content["content"]);
  }
  const image = readImage(content);
  return image ? [image] : [];
}
export function toolContentText(content: unknown): string {
  const parsed = parseStructuredString(content);
  if (parsed !== content) return toolContentText(parsed);
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map(toolContentText).join("");
  if (content == null) return "";
  if (!isRecord(content)) {
    if (
      typeof content === "number" ||
      typeof content === "boolean" ||
      typeof content === "bigint"
    ) {
      return content.toString();
    }
    throw new Error(`工具消息包含不支持的内容类型：${typeof content}`);
  }
  if (Array.isArray(content["content"])) {
    return toolContentText(content["content"]);
  }
  if (
    (content["type"] === "text" || content["type"] === "input_text") &&
    typeof content["text"] === "string"
  ) {
    return content["text"];
  }
  if (readImage(content)) return "";
  return JSON.stringify(content);
}
function prepareResponsesMessages(messages: BaseMessage[]) {
  return messages.map((message) => {
    if (!ToolMessage.isInstance(message)) return message;
    const images = extractToolImages(message.content);
    if (images.length === 0) return message;
    const text = toolContentText(message.content);
    const content: ContentBlock[] = [
      ...(text ? [{ type: "input_text", text }] : []),
      ...images.map(({ src }) => ({
        type: "input_image",
        image_url: src,
        detail: "auto",
      })),
    ];
    return copyToolMessage(message, content);
  });
}
function prepareCompletionsMessages(messages: BaseMessage[]) {
  return messages.map((message) => {
    if (!ToolMessage.isInstance(message)) return message;
    const imageCount = extractToolImages(message.content).length;
    if (imageCount === 0) return message;
    const text = toolContentText(message.content);
    const notice = `工具返回了 ${imageCount.toString()} 张图片，但 Completions API 不支持工具返回图片给模型。`;
    return copyToolMessage(message, [text, notice].filter((part) => part.length > 0).join("\n\n"));
  });
}
function copyToolMessage(message: ToolMessage, content: ContentBlock[] | string) {
  const artifact: unknown = message.artifact;
  return new ToolMessage({
    content,
    tool_call_id: message.tool_call_id,
    name: message.name,
    id: message.id,
    additional_kwargs: message.additional_kwargs,
    response_metadata: message.response_metadata,
    artifact,
    status: message.status,
    metadata: message.metadata,
  });
}
function readImage(value: Record<string, unknown>): ToolImage | null {
  if (value["type"] === "image") {
    const data = value["data"];
    const mimeType = value["mimeType"] ?? value["mime_type"];
    if (typeof data === "string" && typeof mimeType === "string") {
      return { src: `data:${mimeType};base64,${data}`, mimeType };
    }
  }
  if (value["type"] !== "image_url" && value["type"] !== "input_image") {
    return null;
  }
  const raw = value["image_url"];
  const src = typeof raw === "string" ? raw : isRecord(raw) ? raw["url"] : null;
  return typeof src === "string" ? parseImageDataUrl(src) : null;
}
function parseImageDataUrl(src: string): ToolImage | null {
  const match = /^data:([^;,]+)(?:;[^,]*)*;base64,/i.exec(src);
  return match?.[1] ? { src, mimeType: match[1] } : null;
}
function parseStructuredString(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    const parsed: unknown = JSON.parse(value);
    return isStructuredContent(parsed) ? parsed : value;
  } catch {
    return value;
  }
}
function isStructuredContent(value: unknown) {
  return (
    Array.isArray(value) ||
    (isRecord(value) && (Array.isArray(value["content"]) || typeof value["type"] === "string"))
  );
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
