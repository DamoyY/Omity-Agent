import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { MultiServerMCPClient } from "@langchain/mcp-adapters";
import YAML from "yaml";
import type { Logger } from "./logger";

const envPlaceholder = /\$\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g;

export function expandEnvPlaceholders(
  value: unknown,
  path = "settings/mcp.yaml",
): unknown {
  if (typeof value === "string") {
    return value.replaceAll(envPlaceholder, (_match, name: string) => {
      const envValue = process.env[name];
      if (envValue === undefined) {
        throw new Error(`MCP 配置 ${path} 引用了未设置的环境变量 ${name}`);
      }
      return envValue;
    });
  }
  if (Array.isArray(value)) {
    return value.map((item, index) =>
      expandEnvPlaceholders(item, `${path}[${index}]`),
    );
  }
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        expandEnvPlaceholders(item, `${path}.${key}`),
      ]),
    );
  }
  return value;
}

export async function loadMcp(root: string, logger: Logger) {
  const path = resolve(root, "settings", "mcp.yaml");
  if (!existsSync(path)) {
    logger.info("MCP 配置不存在，跳过工具加载", { path });
    return { tools: [], close: async () => {} };
  }
  const parsed = expandEnvPlaceholders(
    YAML.parse(readFileSync(path, "utf8")) ?? {},
  ) as {
    mcpServers?: Record<string, unknown>;
    servers?: Record<string, unknown>;
  };
  const mcpServers = parsed.mcpServers ?? parsed.servers ?? {};
  const names = Object.keys(mcpServers);
  if (names.length === 0) {
    logger.info("MCP 未配置服务器，Agent 将不带工具运行");
    return { tools: [], close: async () => {} };
  }
  const end = logger.child("MCP 工具加载");
  const client = new MultiServerMCPClient({
    mcpServers,
    throwOnLoadError: false,
    prefixToolNameWithServerName: true,
  } as never);
  const tools = await client.getTools();
  logger.info("已加载 MCP 工具", {
    servers: names,
    tools: tools.map((tool) => tool.name),
  });
  end();
  return { tools, close: () => client.close() };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
