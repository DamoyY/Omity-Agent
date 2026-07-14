import type { StructuredToolInterface } from "@langchain/core/tools";
import { customTool } from "@langchain/openai";
import { z } from "zod";

export interface FreeformMcpTools {
  modelTools: StructuredToolInterface[];
  parameters: ReadonlyMap<string, string>;
}
const toolJsonSchema = z.looseObject({
  properties: z.record(z.string(), z.unknown()),
});
const stringParameterSchema = z.looseObject({ type: z.literal("string") });
export function normalizeFreeformToolInputs(
  value: unknown,
  path = "settings/mcp.yaml.freeformToolInputs",
): string[] {
  if (value == null) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new Error(`MCP free-form 工具配置 ${path} 必须是数组`);
  }
  const names = new Set<string>();
  for (const [index, name] of value.entries()) {
    if (typeof name !== "string" || name.length === 0) {
      throw new Error(`MCP free-form 工具配置 ${path}[${index.toString()}] 必须是非空字符串`);
    }
    if (names.has(name)) {
      throw new Error(`MCP free-form 工具配置包含重复工具：${name}`);
    }
    names.add(name);
  }
  return [...names];
}
export function configureFreeformMcpTools(
  tools: StructuredToolInterface[],
  names: string[],
): FreeformMcpTools {
  const toolsByName = new Map(tools.map((tool) => [tool.name, tool]));
  const parameters = new Map<string, string>();
  for (const name of names) {
    const tool = toolsByName.get(name);
    if (!tool) {
      throw new Error(`MCP free-form 工具配置引用了不存在的工具：${name}`);
    }
    parameters.set(name, singleStringParameter(tool));
  }
  return {
    modelTools: tools.map((tool) => {
      if (!parameters.has(tool.name)) {
        return tool;
      }
      return customTool(() => Promise.reject(new Error(`工具定义 ${tool.name} 不能直接用于执行`)), {
        description: tool.description,
        format: { type: "text" },
        name: tool.name,
      });
    }),
    parameters,
  };
}
function singleStringParameter(tool: StructuredToolInterface) {
  const { schema } = tool;
  const parsed = toolJsonSchema.safeParse(schema);
  const entries = parsed.success ? Object.entries(parsed.data.properties) : [];
  if (entries.length !== 1) {
    throw new Error(
      `MCP free-form 工具 ${tool.name} 必须恰好声明一个输入参数，实际为 ${entries.length.toString()} 个`,
    );
  }
  const [entry] = entries;
  if (!entry) {
    throw new Error(`MCP free-form 工具 ${tool.name} 缺少输入参数`);
  }
  const [parameter, definition] = entry;
  if (!parameter) {
    throw new Error(`MCP free-form 工具 ${tool.name} 的输入参数名不能为空`);
  }
  if (!stringParameterSchema.safeParse(definition).success) {
    throw new Error(`MCP free-form 工具 ${tool.name} 的唯一输入参数 ${parameter} 必须是字符串`);
  }
  return parameter;
}
