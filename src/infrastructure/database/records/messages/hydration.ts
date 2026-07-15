import {
  AIMessage,
  HumanMessage,
  type MessageContent,
  type ToolCall,
  ToolMessage,
} from "@langchain/core/messages";
import type { StoredAi, StoredConversationMessage, StoredTool, StoredUsage } from "./payload";
import { structuredOutputArtifact } from "../../../mcp/artifacts";

export function decodeMessage(value: string, id?: string) {
  const stored = parseStoredMessage(value);
  if (stored.type === "human") {
    return new HumanMessage({ content: stored.content, id });
  }
  if (stored.type === "ai") {
    return new AIMessage({
      content: stored.content,
      id,
      ...(stored.toolCalls ? { tool_calls: stored.toolCalls } : {}),
      ...(stored.reasoning ? { additional_kwargs: { reasoning: stored.reasoning } } : {}),
      ...(stored.usage ? { usage_metadata: restoredUsage(stored.usage) } : {}),
    });
  }
  return new ToolMessage({
    additional_kwargs: stored.custom === true ? { customTool: true } : {},
    artifact:
      stored.structuredOutput === undefined
        ? undefined
        : structuredOutputArtifact(stored.structuredOutput),
    content: stored.content,
    id,
    metadata:
      stored.largeOutputTokens === undefined
        ? undefined
        : { largeOutput: { tokens: stored.largeOutputTokens } },
    name: stored.name,
    tool_call_id: stored.toolCallId,
  });
}

function parseStoredMessage(value: string): StoredConversationMessage {
  const parsed: unknown = JSON.parse(value);
  if (!isRecord(parsed) || !isMessageContent(parsed["content"])) {
    throw new Error("messages.message_json 无效");
  }
  if (parsed["type"] === "human") {
    return { content: parsed["content"], type: "human" };
  }
  if (parsed["type"] === "ai") {
    return parseAiMessage(parsed);
  }
  if (parsed["type"] === "tool" && typeof parsed["toolCallId"] === "string") {
    return parseToolMessage(parsed);
  }
  throw new Error("messages.message_json 消息类型无效");
}

function parseAiMessage(value: Record<string, unknown>): StoredAi {
  const { content } = value;
  if (!isMessageContent(content)) {
    throw new Error("AI message content 无效");
  }
  return {
    content,
    type: "ai",
    ...(isToolCallArray(value["toolCalls"]) ? { toolCalls: value["toolCalls"] } : {}),
    ...(isRecord(value["reasoning"]) ? { reasoning: value["reasoning"] } : {}),
    ...(isStoredUsage(value["usage"]) ? { usage: value["usage"] } : {}),
  };
}

function parseToolMessage(value: Record<string, unknown>): StoredTool {
  const { content } = value;
  const { toolCallId } = value;
  if (!isMessageContent(content) || typeof toolCallId !== "string") {
    throw new Error("Tool message 无效");
  }
  return {
    content,
    toolCallId,
    type: "tool",
    ...(value["custom"] === true ? { custom: true } : {}),
    ...(typeof value["largeOutputTokens"] === "number"
      ? { largeOutputTokens: value["largeOutputTokens"] }
      : {}),
    ...(typeof value["name"] === "string" ? { name: value["name"] } : {}),
    ...("structuredOutput" in value ? { structuredOutput: value["structuredOutput"] } : {}),
  };
}

function restoredUsage(usage: StoredUsage) {
  return {
    input_token_details: { cache_read: usage.cacheRead },
    input_tokens: usage.input,
    output_tokens: usage.output,
    total_tokens: usage.input + usage.output,
  };
}

function isStoredUsage(value: unknown): value is StoredUsage {
  return (
    isRecord(value) &&
    typeof value["cacheRead"] === "number" &&
    typeof value["input"] === "number" &&
    typeof value["output"] === "number"
  );
}

function isMessageContent(value: unknown): value is MessageContent {
  return typeof value === "string" || Array.isArray(value);
}

function isToolCallArray(value: unknown): value is ToolCall[] {
  return (
    Array.isArray(value) &&
    value.every(
      (item) =>
        isRecord(item) &&
        typeof item["name"] === "string" &&
        isRecord(item["args"]) &&
        item["type"] === "tool_call",
    )
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
