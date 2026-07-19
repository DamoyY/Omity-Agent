import type { StructuredToolInterface } from "@langchain/core/tools";
import { readFileSync } from "node:fs";
import { resolveConfiguredPath } from "../configuration/configuredPath";

type McpToolNameOverrides = Record<string, string>;
type McpToolDescriptionOverrides = Record<string, string>;
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
export function normalizeMcpToolDescriptionOverrides(
  value: unknown,
  path = "settings/mcp.yaml.toolDescriptionOverrides",
): McpToolDescriptionOverrides {
  if (value == null) {
    return {};
  }
  if (!isRecord(value)) {
    throw new Error(`MCP 工具描述覆盖配置 ${path} 必须是对象`);
  }
  return Object.fromEntries(
    Object.entries(value).map(([name, file]) => {
      if (typeof file !== "string" || file.length === 0) {
        throw new Error(`MCP 工具描述覆盖配置 ${path}.${name} 必须是非空路径`);
      }
      return [name, file];
    }),
  );
}
export function renameMcpTools(tools: StructuredToolInterface[], overrides: McpToolNameOverrides) {
  const toolsByName = indexMcpTools(tools);
  for (const from of Object.keys(overrides)) {
    if (!toolsByName.has(from)) {
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
export function overrideMcpToolDescriptions(
  tools: StructuredToolInterface[],
  overrides: McpToolDescriptionOverrides,
  root: string,
) {
  const toolsByName = indexMcpTools(tools);
  const descriptions = new Map<string, string>();
  for (const [name, configuredPath] of Object.entries(overrides)) {
    if (!toolsByName.has(name)) {
      throw new Error(`MCP 工具描述覆盖配置引用了不存在的工具：${name}`);
    }
    const path = resolveConfiguredPath(root, configuredPath);
    let description: string;
    try {
      description = readFileSync(path, "utf8").trimEnd();
    } catch (error) {
      throw new Error(`无法读取 MCP 工具 ${name} 的描述覆盖文件：${path}`, { cause: error });
    }
    if (description.length === 0) {
      throw new Error(`MCP 工具 ${name} 的描述覆盖文件不能为空：${path}`);
    }
    descriptions.set(name, description);
  }
  for (const [name, description] of descriptions) {
    const tool = toolsByName.get(name);
    if (!tool) {
      throw new Error(`MCP 工具描述覆盖配置引用了不存在的工具：${name}`);
    }
    tool.description = description;
  }
  return tools;
}
function indexMcpTools(tools: StructuredToolInterface[]) {
  const toolsByName = new Map<string, StructuredToolInterface>();
  for (const tool of tools) {
    if (toolsByName.has(tool.name)) {
      throw new Error(`MCP 工具名称重复：${tool.name}`);
    }
    toolsByName.set(tool.name, tool);
  }
  return toolsByName;
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
