import type { StructuredToolInterface } from "@langchain/core/tools";

type McpToolNameOverrides = Record<string, string>;
export function normalizeMcpToolNameOverrides(
  value: unknown,
  path = "settings/mcp.yaml.toolNameOverrides",
): McpToolNameOverrides {
  if (value == null) {
    return {};
  }
  if (!isRecord(value)) {
    throw new Error(`MCP 工具重命名配置 ${path} 必须是对象`);
  }
  return Object.fromEntries(
    Object.entries(value).map(([from, to]) => {
      if (typeof to !== "string" || to.length === 0) {
        throw new Error(`MCP 工具重命名配置 ${path}.${from} 必须是非空字符串`);
      }
      if (to === "agent") {
        throw new Error(`MCP 工具重命名配置 ${path}.${from} 不能命名为 agent`);
      }
      return [from, to];
    }),
  );
}
export function renameMcpTools(tools: StructuredToolInterface[], overrides: McpToolNameOverrides) {
  const originalNames = new Set<string>();
  for (const tool of tools) {
    if (originalNames.has(tool.name)) {
      throw new Error(`MCP 工具名称重复：${tool.name}`);
    }
    originalNames.add(tool.name);
  }
  for (const from of Object.keys(overrides)) {
    if (!originalNames.has(from)) {
      throw new Error(`MCP 工具重命名配置引用了不存在的工具：${from}`);
    }
  }
  const finalNames = new Set<string>();
  for (const tool of tools) {
    const name = overrides[tool.name] ?? tool.name;
    if (finalNames.has(name)) {
      throw new Error(`MCP 工具重命名后名称冲突：${name}`);
    }
    finalNames.add(name);
  }
  for (const tool of tools) {
    tool.name = overrides[tool.name] ?? tool.name;
  }
  return tools;
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
