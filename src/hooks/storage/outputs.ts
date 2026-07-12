import type { ToolMessage } from "@langchain/core/messages";

export function readToolOutput(message: ToolMessage) {
  const structuredOutput = extractStructuredOutput(message.artifact);
  return {
    output: message.content,
    ...(structuredOutput === undefined ? {} : { structuredOutput }),
  };
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
