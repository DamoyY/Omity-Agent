import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { ToolMessage } from "@langchain/core/messages";
import { createMiddleware } from "langchain";
import { getEncoding } from "js-tiktoken";
import { safeId } from "../infrastructure/config";
import type { Settings } from "../types";

const tokenizer = getEncoding("o200k_base");

type LargeOutputRuntimeContext = {
  sessionId: string;
};

type LargeToolOutputOptions = {
  dataDir: string;
  maxTokens: number;
  sessionId: string;
  outputId?: string;
};

export function createLargeToolOutputMiddleware(settings: Settings) {
  return createMiddleware({
    name: "large-tool-output",
    wrapToolCall: async (request, handler) => {
      const result = await handler(request);
      if (!ToolMessage.isInstance(result)) return result;
      return redirectLargeToolOutput(result, {
        dataDir: settings.paths.dataDir,
        maxTokens: settings.toolOutput.maxTokens,
        sessionId: getSessionId(request.runtime.context),
        outputId: request.toolCall.id,
      });
    },
  });
}

export async function redirectLargeToolOutput(
  message: ToolMessage,
  options: LargeToolOutputOptions,
) {
  if (message.status === "error") return message;
  const normalized = normalizeMcpTextResult(message.content);
  if (normalized === null || normalized.isError) return message;
  const original = normalized.text;
  const tokens = countTokens(original);
  const normalizedMessage =
    original === message.content ? message : copyToolMessage(message, original);
  if (tokens <= options.maxTokens) return normalizedMessage;

  const outputPath = await writeLargeToolOutput(
    original,
    options.dataDir,
    options.sessionId,
    options.outputId,
  );
  const content = `工具输出过长（${tokens} tokens），无法直接查看。原始输出内容已保存于：${outputPath}`;
  return copyToolMessage(message, content, { path: outputPath, tokens });
}

export function countTokens(text: string) {
  return tokenizer.encode(text).length;
}

function copyToolMessage(
  message: ToolMessage,
  content: string,
  largeOutput?: { path: string; tokens: number },
) {
  return new ToolMessage({
    content,
    tool_call_id: message.tool_call_id,
    name: message.name,
    id: message.id,
    additional_kwargs: message.additional_kwargs,
    response_metadata: message.response_metadata,
    artifact: message.artifact,
    status: message.status,
    metadata: {
      ...message.metadata,
      ...(largeOutput ? { largeOutput } : {}),
    },
  });
}

function getSessionId(context: unknown) {
  if (!isLargeOutputRuntimeContext(context)) {
    throw new Error("工具输出重定向缺少运行时 sessionId");
  }
  return context.sessionId;
}

function normalizeMcpTextResult(
  content: ToolMessage["content"] | unknown,
): { text: string; isError: boolean } | null {
  if (typeof content === "string") {
    return normalizeStringContent(content);
  }
  return normalizeMcpValue(content, false);
}

function normalizeStringContent(content: string) {
  try {
    const parsed: unknown = JSON.parse(content);
    return isMcpContentShape(parsed)
      ? normalizeMcpValue(parsed, false)
      : { text: content, isError: false };
  } catch {
    return { text: content, isError: false };
  }
}

function normalizeMcpValue(
  value: unknown,
  isError: boolean,
): { text: string; isError: boolean } | null {
  if (Array.isArray(value)) return normalizeMcpContentBlocks(value, isError);
  if (isMcpCallToolResult(value)) {
    return normalizeMcpContentBlocks(value.content, value.isError === true);
  }
  if (isTextContent(value)) return { text: value.text, isError };
  return null;
}

function normalizeMcpContentBlocks(blocks: unknown[], isError: boolean) {
  const parts = blocks.map((block) => normalizeMcpValue(block, isError));
  return parts.every((part) => part !== null)
    ? { text: parts.map((part) => part.text).join(""), isError }
    : null;
}

function isLargeOutputRuntimeContext(
  value: unknown,
): value is LargeOutputRuntimeContext {
  return (
    typeof value === "object" &&
    value !== null &&
    "sessionId" in value &&
    typeof value.sessionId === "string" &&
    value.sessionId.length > 0
  );
}

function isMcpCallToolResult(
  value: unknown,
): value is { content: unknown[]; isError?: boolean } {
  return (
    typeof value === "object" &&
    value !== null &&
    "content" in value &&
    Array.isArray(value.content)
  );
}

function isMcpContentShape(value: unknown) {
  return (
    Array.isArray(value) || isMcpCallToolResult(value) || isTextContent(value)
  );
}

function isTextContent(value: unknown): value is { text: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    "text" in value &&
    typeof value.text === "string"
  );
}

async function writeLargeToolOutput(
  content: string,
  dataDir: string,
  sessionId: string,
  outputId: string | undefined,
) {
  const dir = resolve(dataDir, "sessions", safeId(sessionId), "large_output");
  mkdirSync(dir, { recursive: true });
  const id = safeId(outputId ?? randomUUID());
  const path = join(dir, `${id}.txt`);
  await writeFile(path, content, "utf8");
  return path;
}
