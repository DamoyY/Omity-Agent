import YAML from "yaml";
import { normalizeFreeformToolInputs } from "./freeformInputs";
import { normalizeMcpToolNameOverrides } from "./nameOverrides";
import { readFileSync } from "node:fs";
import { z } from "zod";

const envPlaceholder = /\$\{(?<name>[a-zA-Z_][a-zA-Z0-9_]*)\}/g;
type McpServers = Record<string, unknown>;
const mcpServerSchema = z.looseObject({});
const mcpServersSchema = z.record(z.string(), mcpServerSchema);
const mcpConfigurationSchema = z
  .object({
    freeformToolInputs: z.unknown().optional(),
    mcpServers: mcpServersSchema.optional(),
    toolNameOverrides: z.unknown().optional(),
  })
  .strict();
const stdioServerSchema = z.looseObject({
  args: z.array(z.string()).optional(),
  command: z.string(),
});
export function readMcpConfiguration(path: string) {
  const parsed = expandEnvPlaceholders(YAML.parse(readFileSync(path, "utf8")) ?? {});
  const result = mcpConfigurationSchema.safeParse(parsed);
  if (!result.success) {
    const rootIssue = result.error.issues.find(
      (issue) => issue.code === "invalid_type" && issue.path.length === 0,
    );
    if (rootIssue) {
      throw new Error(`MCP 配置 ${path} 必须是对象`);
    }
    throw result.error;
  }
  const configuration = result.data;
  return {
    freeformToolInputs: normalizeFreeformToolInputs(configuration.freeformToolInputs),
    mcpServers: normalizeMcpServers(configuration.mcpServers ?? {}),
    toolNameOverrides: normalizeMcpToolNameOverrides(configuration.toolNameOverrides),
  };
}
export function expandEnvPlaceholders(value: unknown, path = "settings/mcp.yaml"): unknown {
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
    return value.map((item, index) => expandEnvPlaceholders(item, `${path}[${index.toString()}]`));
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
    Object.entries(mcpServers).map(([name, server]) => [name, normalizeMcpServer(server)]),
  );
}
function normalizeMcpServer(server: unknown): unknown {
  if (!isRecord(server)) {
    return server;
  }
  if ("command" in server) {
    const result = stdioServerSchema.safeParse(server);
    if (!result.success) {
      throw result.error;
    }
    return {
      ...result.data,
      args: result.data.args ?? [],
      stderr: "ignore",
    };
  }
  if (server["transport"] === "sse" || server["type"] === "sse") {
    throw new Error("MCP SSE transport 无法关闭底层自动重连，请改用 http");
  }
  if ("authProvider" in server) {
    throw new Error("MCP authProvider 会在认证失败后自动重试，请改用静态 headers");
  }
  if (!("url" in server)) {
    return server;
  }
  return {
    ...server,
    automaticSSEFallback: false,
    reconnect: { enabled: false, maxAttempts: 0 },
  };
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
