import {
  AIMessage,
  type BaseMessage,
  HumanMessage,
  type MessageContent,
  type ToolCall,
  ToolMessage,
} from "@langchain/core/messages";
import { structuredToolOutput } from "../../../mcp/artifacts";

export type MessageStorageMode = "history" | "recovery";
export interface StoredUsage {
  cacheRead: number;
  input: number;
  output: number;
}
export interface StoredHuman {
  content: MessageContent;
  type: "human";
}
export interface StoredAi {
  content: MessageContent;
  reasoning?: Record<string, unknown>;
  toolCalls?: ToolCall[];
  type: "ai";
  usage?: StoredUsage;
}
export interface StoredTool {
  content: MessageContent;
  custom?: boolean;
  largeOutputTokens?: number;
  name?: string;
  structuredOutput?: unknown;
  toolCallId: string;
  type: "tool";
}
export type StoredConversationMessage = StoredHuman | StoredAi | StoredTool;
export function encodeMessage(message: BaseMessage, mode: MessageStorageMode) {
  if (HumanMessage.isInstance(message)) {
    return { content: message.content, type: "human" } satisfies StoredHuman;
  }
  if (AIMessage.isInstance(message)) {
    return encodeAiMessage(message);
  }
  if (ToolMessage.isInstance(message)) {
    return encodeToolMessage(message, mode);
  }
  throw new Error(`不支持持久化消息类型：${message.type}`);
}
function encodeAiMessage(message: AIMessage): StoredAi {
  const reasoning = storedReasoning(message);
  const usage = storedUsage(message);
  const customTools = customToolMetadata(message);
  return {
    content: message.content,
    type: "ai",
    ...(message.tool_calls?.length
      ? { toolCalls: message.tool_calls.map((call) => storedToolCall(call, customTools)) }
      : {}),
    ...(reasoning === undefined ? {} : { reasoning }),
    ...(usage === undefined ? {} : { usage }),
  };
}
function encodeToolMessage(message: ToolMessage, mode: MessageStorageMode): StoredTool {
  const structuredOutput = mode === "recovery" ? structuredToolOutput(message.artifact) : undefined;
  const largeOutputTokens = readLargeOutputTokens(message);
  return {
    content: message.content,
    toolCallId: message.tool_call_id,
    type: "tool",
    ...(message.additional_kwargs["customTool"] === true ? { custom: true } : {}),
    ...(largeOutputTokens === undefined ? {} : { largeOutputTokens }),
    ...(message.name ? { name: message.name } : {}),
    ...(structuredOutput === undefined ? {} : { structuredOutput }),
  };
}
function storedToolCall(
  value: ToolCall,
  customTools: { callIds: Set<string>; itemIds: Map<string, string> },
): ToolCall {
  const directItemId = Reflect.get(value, "call_id");
  const itemId =
    typeof directItemId === "string" && directItemId.length > 0
      ? directItemId
      : value.id
        ? customTools.itemIds.get(value.id)
        : undefined;
  return {
    args: value.args,
    name: value.name,
    type: "tool_call" as const,
    ...(value.id ? { id: value.id } : {}),
    ...(Reflect.get(value, "isCustomTool") === true ||
    (value.id && customTools.callIds.has(value.id))
      ? { isCustomTool: true }
      : {}),
    ...(itemId ? { call_id: itemId } : {}),
  };
}
function customToolMetadata(message: AIMessage) {
  const callIds = new Set<string>();
  const itemIds = new Map<string, string>();
  const mapped = message.additional_kwargs["__openai_custom_tool_call_ids__"];
  if (isRecord(mapped)) {
    for (const [callId, itemId] of Object.entries(mapped)) {
      callIds.add(callId);
      if (typeof itemId === "string" && itemId.length > 0) {
        itemIds.set(callId, itemId);
      }
    }
  }
  const outputs = message.additional_kwargs["tool_outputs"];
  if (Array.isArray(outputs)) {
    for (const output of outputs) {
      if (isRecord(output) && output["type"] === "custom_tool_call") {
        const callId = output["call_id"];
        if (typeof callId === "string") {
          callIds.add(callId);
          const itemId = output["id"];
          if (typeof itemId === "string" && itemId.length > 0) {
            itemIds.set(callId, itemId);
          }
        }
      }
    }
  }
  return { callIds, itemIds };
}
function storedReasoning(message: AIMessage) {
  const direct = isRecord(message.additional_kwargs["reasoning"])
    ? message.additional_kwargs["reasoning"]
    : undefined;
  const { output } = message.response_metadata;
  const raw = Array.isArray(output)
    ? output.find((item) => isRecord(item) && item["type"] === "reasoning")
    : undefined;
  if (!direct && !isRecord(raw)) {
    return undefined;
  }
  return {
    ...direct,
    ...(isRecord(raw) && typeof raw["encrypted_content"] === "string"
      ? { encrypted_content: raw["encrypted_content"] }
      : {}),
  };
}
function storedUsage(message: AIMessage): StoredUsage | undefined {
  if (!message.usage_metadata) {
    return undefined;
  }
  return {
    cacheRead: message.usage_metadata.input_token_details?.cache_read ?? 0,
    input: message.usage_metadata.input_tokens,
    output: message.usage_metadata.output_tokens,
  };
}
function readLargeOutputTokens(message: ToolMessage) {
  const largeOutput = message.metadata?.["largeOutput"];
  return isRecord(largeOutput) && typeof largeOutput["tokens"] === "number"
    ? largeOutput["tokens"]
    : undefined;
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
