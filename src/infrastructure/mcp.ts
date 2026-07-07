import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadMcpTools, MultiServerMCPClient } from "@langchain/mcp-adapters";
import YAML from "yaml";
import type { Logger } from "./logger";
import { collectReadableZodIssues } from "./mcpSupport/schemaIssueText";
import {
  normalizeMcpToolNameOverrides,
  renameMcpTools,
} from "./mcpSupport/toolNameOverrides";
import { createMcpErrorOutputClient } from "./mcpSupport/toolErrorOutput";

const envPlaceholder = /\$\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g;

type McpServers = Record<string, unknown>;

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

export function normalizeMcpServers(mcpServers: McpServers): McpServers {
  return Object.fromEntries(
    Object.entries(mcpServers).map(([name, server]) => [
      name,
      normalizeMcpServer(server),
    ]),
  );
}

export function createMcpLoadError(error: unknown): Error {
  const details = collectReadableZodIssues(error);
  if (details.length === 0) {
    const message = error instanceof Error ? error.message : String(error);
    return new Error(`MCP 工具加载失败：${message}`, { cause: error });
  }
  return new Error(
    ["MCP 配置校验失败：", ...details.map((detail) => `- ${detail}`)].join(
      "\n",
    ),
    { cause: error },
  );
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
    toolNameOverrides?: unknown;
  };
  const mcpServers = normalizeMcpServers(
    parsed.mcpServers ?? parsed.servers ?? {},
  );
  const toolNameOverrides = normalizeMcpToolNameOverrides(
    parsed.toolNameOverrides,
  );
  const names = Object.keys(mcpServers);
  if (names.length === 0) {
    if (Object.keys(toolNameOverrides).length > 0) {
      throw new Error("MCP 工具重命名配置需要至少配置一个 MCP 服务器");
    }
    logger.info("MCP 未配置服务器，Agent 将不带工具运行");
    return { tools: [], close: async () => {} };
  }
  const end = logger.child("MCP 工具加载");
  let client: MultiServerMCPClient | undefined;
  try {
    client = new MultiServerMCPClient({
      mcpServers,
      throwOnLoadError: false,
      prefixToolNameWithServerName: true,
    } as never);
    const tools = renameMcpTools(
      (
        await Promise.all(
          names.map(async (name) => {
            const serverClient = await client?.getClient(name);
            if (serverClient === undefined) return [];
            return loadMcpTools(
              name,
              createMcpErrorOutputClient(serverClient, name),
              {
                throwOnLoadError: false,
                prefixToolNameWithServerName: true,
              },
            );
          }),
        )
      ).flat(),
      toolNameOverrides,
    );
    logger.info("已加载 MCP 工具", {
      servers: names,
      tools: tools.map((tool) => tool.name),
    });
    const connectedClient = client;
    return { tools, close: () => connectedClient.close() };
  } catch (error) {
    if (client !== undefined) {
      await client.close();
    }
    throw createMcpLoadError(error);
  } finally {
    end();
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeMcpServer(server: unknown): unknown {
  if (!isRecord(server)) {
    return server;
  }
  if (typeof server["command"] === "string" && server["args"] == null) {
    return { ...server, args: [] };
  }
  return server;
}
