import { type MessageContent, ToolMessage } from "@langchain/core/messages";
import { join, resolve } from "node:path";
import type { Settings } from "../types";
import { claimShortIdAsync } from "../infrastructure/randomId";
import { countTokens } from "./tokenizer";
import { createMiddleware } from "langchain";
import { inspectToolTextContent } from "./outputText";
import { mkdirSync } from "node:fs";
import { safeId } from "../infrastructure/configuration/sessionPaths";
import { writeFile } from "node:fs/promises";

interface LargeOutputRuntimeContext {
  sessionId: string;
}
interface LargeToolOutputOptions {
  dataDir: string;
  maxTokens: number;
  sessionId: string;
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
  const outputPath = await writeLargeToolOutput(original, options.dataDir, options.sessionId);
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
async function writeLargeToolOutput(content: string, dataDir: string, sessionId: string) {
  const dir = resolve(dataDir, "sessions", safeId(sessionId), "large_output");
  mkdirSync(dir, { recursive: true });
  let path = "";
  await claimShortIdAsync(async (id) => {
    path = join(dir, `${id}.txt`);
    try {
      await writeFile(path, content, { encoding: "utf8", flag: "wx" });
      return true;
    } catch (error) {
      if (isExistsError(error)) {
        return false;
      }
      throw error;
    }
  });
  return path;
}
function isExistsError(error: unknown) {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as Error & { code?: unknown }).code === "EEXIST"
  );
}
