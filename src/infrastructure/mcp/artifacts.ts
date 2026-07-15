export function structuredToolOutput(value: unknown) {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const matches = value.filter(isStructuredArtifact);
  if (matches.length > 1) {
    throw new Error("MCP 工具返回了多个结构化输出 artifact");
  }
  const [artifact] = matches;
  if (!artifact) {
    return undefined;
  }
  if (!("data" in artifact)) {
    throw new Error("MCP 结构化输出 artifact 缺少 data");
  }
  return artifact["data"];
}
export function structuredOutputArtifact(data: unknown) {
  return [{ data, type: "mcp_structured_content" }];
}
function isStructuredArtifact(
  value: unknown,
): value is Record<string, unknown> & { type: "mcp_structured_content" } {
  return isRecord(value) && value["type"] === "mcp_structured_content";
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
