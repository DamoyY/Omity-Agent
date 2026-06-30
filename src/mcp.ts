import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { MultiServerMCPClient } from "@langchain/mcp-adapters";
import YAML from "yaml";
import type { Logger } from "./logger";

export async function loadMcp(root: string, logger: Logger) {
  const path = resolve(root, "mcp.yaml");
  if (!existsSync(path)) {
    logger.info("MCP 配置不存在，跳过工具加载", { path });
    return { tools: [], close: async () => {} };
  }
  const parsed = YAML.parse(readFileSync(path, "utf8")) ?? {};
  const mcpServers = parsed.mcpServers ?? parsed.servers ?? {};
  const names = Object.keys(mcpServers);
  if (names.length === 0) {
    logger.info("MCP 未配置服务器，Agent 将不带工具运行");
    return { tools: [], close: async () => {} };
  }
  const end = logger.child("MCP 工具加载");
  const client = new MultiServerMCPClient({ mcpServers, throwOnLoadError: false, prefixToolNameWithServerName: true } as never);
  const tools = await client.getTools();
  logger.info("已加载 MCP 工具", { servers: names, tools: tools.map((tool) => tool.name) });
  end();
  return { tools, close: () => client.close() };
}
