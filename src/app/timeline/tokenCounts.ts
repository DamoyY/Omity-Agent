import {
  AIMessage,
  type BaseMessage,
  type ToolMessage,
} from "@langchain/core/messages";
import { countTokens } from "../../runtime/tokenizer";
import type { TokenUsage } from "./types";

export function toolInputTokens(call: Record<string, unknown>, input: unknown) {
  if (call["isCustomTool"] === true) {
    if (!isRecord(input) || typeof input["input"] !== "string") {
      throw new Error("自定义工具输入不是字符串");
    }
    return countTokens(input["input"]);
  }
  if (typeof input === "string") return countTokens(input);
  const serialized: unknown = JSON.stringify(input);
  if (typeof serialized !== "string") throw new Error("工具输入无法序列化");
  return countTokens(serialized);
}

export function toolOutputTokens(message: ToolMessage, text: string) {
  const largeOutput: unknown = message.metadata?.["largeOutput"];
  if (largeOutput === undefined) return countTokens(text);
  if (!isRecord(largeOutput)) throw new Error("工具大输出 metadata 无效");
  const tokens = largeOutput["tokens"];
  if (!Number.isSafeInteger(tokens) || (tokens as number) < 0) {
    throw new Error("工具大输出 token 数无效");
  }
  return tokens as number;
}

export function modelTokenUsage(message: BaseMessage): TokenUsage | undefined {
  if (!AIMessage.isInstance(message) || !message.usage_metadata) {
    return undefined;
  }
  const {
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    input_token_details: inputDetails,
  } = message.usage_metadata;
  const cacheReadTokens = inputDetails?.cache_read ?? 0;
  for (const [name, value] of Object.entries({
    inputTokens,
    outputTokens,
    cacheReadTokens,
  })) {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new Error(`模型 usage_metadata.${name} 无效`);
    }
  }
  if (cacheReadTokens > inputTokens) {
    throw new Error("模型 cache_read tokens 超过 input tokens");
  }
  return { inputTokens, outputTokens, cacheReadTokens };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
