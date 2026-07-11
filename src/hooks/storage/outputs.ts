import {
  mapChatMessagesToStoredMessages,
  mapStoredMessagesToChatMessages,
  type StoredMessage,
  type ToolMessage,
} from "@langchain/core/messages";

type StoredOutput = {
  output: unknown;
  structuredOutput?: unknown;
  message?: StoredMessage;
};

export function serializeToolOutput(output: ToolMessage) {
  const [message] = mapChatMessagesToStoredMessages([output]);
  if (!message) throw new Error("无法序列化工具结果");
  const structuredOutput = extractStructuredOutput(output.artifact);
  const stored: StoredOutput = {
    output: output.content,
    ...(structuredOutput === undefined ? {} : { structuredOutput }),
    message,
  };
  const json = JSON.stringify(stored);
  if (json === undefined) throw new Error("工具结果无法持久化");
  return json;
}

export function restoreToolOutput(value: string | null) {
  const stored = parseOutput(value);
  if (!stored?.message) return undefined;
  const [message] = mapStoredMessagesToChatMessages([stored.message]);
  return message as ToolMessage | undefined;
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
  return parsed as StoredOutput;
}

function extractStructuredOutput(value: unknown) {
  if (!Array.isArray(value)) return undefined;
  const artifacts = value.filter(
    (item) =>
      typeof item === "object" &&
      item !== null &&
      "type" in item &&
      item.type === "mcp_structured_content",
  );
  if (artifacts.length > 1) {
    throw new Error("MCP 工具返回了多个结构化输出 artifact");
  }
  const artifact = artifacts[0];
  if (!artifact) return undefined;
  if (!("data" in artifact)) {
    throw new Error("MCP 结构化输出 artifact 缺少 data");
  }
  return artifact.data;
}
