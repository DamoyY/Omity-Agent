import {
  ToolMessage,
  mapChatMessagesToStoredMessages,
  mapStoredMessagesToChatMessages,
  type StoredMessage,
} from "@langchain/core/messages";

interface StoredOutput {
  output: unknown;
  structuredOutput?: unknown;
  message?: StoredMessage;
}

export function serializeToolOutput(output: ToolMessage) {
  const serialized: unknown = mapChatMessagesToStoredMessages([output]);
  if (!isStoredMessages(serialized) || !serialized[0]) {
    throw new Error("无法序列化工具结果");
  }
  const message = serialized[0];
  const structuredOutput = extractStructuredOutput(output.artifact);
  const stored: StoredOutput = {
    output: output.content,
    ...(structuredOutput === undefined ? {} : { structuredOutput }),
    message,
  };
  const json = JSON.stringify(stored);
  return json;
}

export function restoreToolOutput(value: string | null) {
  const stored = parseOutput(value);
  if (!stored?.message) return undefined;
  const restored: unknown = mapStoredMessagesToChatMessages([stored.message]);
  if (!Array.isArray(restored)) throw new Error("Hook 工具结果记录无效");
  const message: unknown = restored[0];
  return ToolMessage.isInstance(message) ? message : undefined;
}

export function readToolOutput(value: string | null) {
  const stored = parseOutput(value);
  if (!stored) return undefined;
  return {
    output: stored.output,
    ...(stored.structuredOutput === undefined
      ? {}
      : { structuredOutput: stored.structuredOutput }),
  };
}

function parseOutput(value: string | null): StoredOutput | undefined {
  if (value === null) return undefined;
  const parsed = JSON.parse(value) as unknown;
  if (typeof parsed !== "object" || parsed === null || !("output" in parsed)) {
    throw new Error("Hook 工具结果记录无效");
  }
  return parsed;
}

function extractStructuredOutput(value: unknown) {
  if (!isUnknownArray(value)) return undefined;
  const artifacts = value.filter(isStructuredArtifact);
  if (artifacts.length > 1) {
    throw new Error("MCP 工具返回了多个结构化输出 artifact");
  }
  const artifact = artifacts[0];
  if (!artifact) return undefined;
  if (!("data" in artifact)) {
    throw new Error("MCP 结构化输出 artifact 缺少 data");
  }
  return artifact["data"];
}

function isStoredMessages(value: unknown): value is StoredMessage[] {
  return isUnknownArray(value) && value.every(isStoredMessage);
}

function isStoredMessage(value: unknown): value is StoredMessage {
  return isRecord(value) && typeof value["type"] === "string";
}

function isStructuredArtifact(
  value: unknown,
): value is Record<string, unknown> & { type: "mcp_structured_content" } {
  return isRecord(value) && value["type"] === "mcp_structured_content";
}

function isUnknownArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
