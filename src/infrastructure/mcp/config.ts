import { readFileSync } from "node:fs";
import YAML from "yaml";
import { normalizeFreeformToolInputs } from "./freeformInputs";
import { normalizeMcpToolNameOverrides } from "./nameOverrides";

const envPlaceholder = /\$\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g;

type McpServers = Record<string, unknown>;

export function readMcpConfiguration(path: string) {
  const parsed = expandEnvPlaceholders(
    YAML.parse(readFileSync(path, "utf8")) ?? {},
  );
  if (!isRecord(parsed)) {
    throw new Error(`MCP 配置 ${path} 必须是对象`);
  }
  return {
    mcpServers: normalizeMcpServers(
      recordValue(parsed["mcpServers"] ?? parsed["servers"]),
    ),
    toolNameOverrides: normalizeMcpToolNameOverrides(
      parsed["toolNameOverrides"],
    ),
    freeformToolInputs: normalizeFreeformToolInputs(
      parsed["freeformToolInputs"],
    ),
  };
}

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
      expandEnvPlaceholders(item, `${path}[${index.toString()}]`),
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

function normalizeMcpServer(server: unknown): unknown {
  if (!isRecord(server) || typeof server["command"] !== "string") {
    return server;
  }
  return {
    ...server,
    args: server["args"] ?? [],
    stderr: "ignore",
  };
}

function recordValue(value: unknown): Record<string, unknown> {
  if (value === undefined) return {};
  if (!isRecord(value)) {
    throw new Error("MCP servers 配置必须是对象");
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
