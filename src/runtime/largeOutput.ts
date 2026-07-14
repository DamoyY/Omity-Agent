import { type MessageContent, ToolMessage } from "@langchain/core/messages";
import { createHash, randomBytes } from "node:crypto";
import { join, resolve } from "node:path";
import type { Settings } from "../types";
import { countTokens } from "./tokenizer";
import { createMiddleware } from "langchain";
import { inspectToolTextContent } from "./outputText";
import { mkdirSync } from "node:fs";
import { safeId } from "../infrastructure/configuration/sessionPaths";
import { writeFile } from "node:fs/promises";
const outputFileIdBytes = 16;
interface LargeOutputRuntimeContext {
  sessionId: string;
}
interface LargeToolOutputOptions {
  dataDir: string;
  maxTokens: number;
  sessionId: string;
  outputId?: string;
}
export function createLargeToolOutputMiddleware(settings: Settings) {
  return createMiddleware({
    name: "large-tool-output",
    wrapToolCall: async (request, handler) => {
      const result = await handler(request);
      if (!ToolMessage.isInstance(result)) {
        return result;
      }
      return redirectLargeToolOutput(result, {
        dataDir: settings.paths.dataDir,
        maxTokens: settings.toolOutput.maxTokens,
        outputId: request.toolCall.id,
        sessionId: getSessionId(request.runtime.context),
      });
    },
  });
}
export async function redirectLargeToolOutput(
  message: ToolMessage,
  options: LargeToolOutputOptions,
) {
  if (message.status === "error") {
    return message;
  }
  const normalized = inspectToolTextContent(message.content);
  if (normalized === null || normalized.isError) {
    return message;
  }
  const original = normalized.text;
  const tokens = countTokens(original);
  const normalizedMessage =
    normalized.normalized === message.content
      ? message
      : copyToolMessage(message, normalized.normalized);
  if (tokens <= options.maxTokens) {
    return normalizedMessage;
  }
  const outputPath = await writeLargeToolOutput(
    original,
    options.dataDir,
    options.sessionId,
    options.outputId,
  );
  const content = `工具输出过长（${tokens.toString()} tokens），无法直接查看。\n原始输出内容已保存于：${outputPath}，请按需检索其中片段。`;
  return copyToolMessage(message, normalized.replaceText(content), {
    path: outputPath,
    tokens,
  });
}
function copyToolMessage(
  message: ToolMessage,
  content: MessageContent,
  largeOutput?: { path: string; tokens: number },
) {
  const { artifact } = message;
  return new ToolMessage({
    additional_kwargs: message.additional_kwargs,
    artifact,
    content,
    id: message.id,
    metadata: mergeMetadata(message.metadata, largeOutput),
    name: message.name,
    response_metadata: message.response_metadata,
    status: message.status,
    tool_call_id: message.tool_call_id,
  });
}
function getSessionId(context: unknown) {
  if (!isLargeOutputRuntimeContext(context)) {
    throw new Error("工具输出重定向缺少运行时 sessionId");
  }
  return context.sessionId;
}
function mergeMetadata(
  metadata: unknown,
  largeOutput: { path: string; tokens: number } | undefined,
) {
  if (metadata !== undefined && !isRecord(metadata)) {
    throw new Error("工具消息 metadata 必须是对象");
  }
  return { ...metadata, ...(largeOutput ? { largeOutput } : {}) };
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isLargeOutputRuntimeContext(value: unknown): value is LargeOutputRuntimeContext {
  return (
    typeof value === "object" &&
    value !== null &&
    "sessionId" in value &&
    typeof value.sessionId === "string" &&
    value.sessionId.length > 0
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
  const id = createOutputFileId(outputId);
  const path = join(dir, `${id}.txt`);
  await writeFile(path, content, "utf8");
  return path;
}
function createOutputFileId(outputId: string | undefined) {
  const bytes = outputId
    ? createHash("sha256").update(outputId).digest().subarray(0, outputFileIdBytes)
    : randomBytes(outputFileIdBytes);
  return bytes.toString("base64url");
}
