import { readFileSync } from "node:fs";
import YAML from "yaml";
import { normalizeFreeformToolInputs } from "./freeformInputs";
import { normalizeMcpToolNameOverrides } from "./nameOverrides";
import { z } from "zod";

const envPlaceholder = /\$\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g;

type McpServers = Record<string, unknown>;

const mcpServerSchema = z.looseObject({});
const mcpServersSchema = z.record(z.string(), mcpServerSchema);
const mcpConfigurationSchema = z
  .object({
    mcpServers: mcpServersSchema.optional(),
    toolNameOverrides: z.unknown().optional(),
    freeformToolInputs: z.unknown().optional(),
  })
  .strict();
const stdioServerSchema = z.looseObject({
  command: z.string(),
  args: z.array(z.string()).optional(),
});

export function readMcpConfiguration(path: string) {
  const parsed = expandEnvPlaceholders(
    YAML.parse(readFileSync(path, "utf8")) ?? {},
  );
  const result = mcpConfigurationSchema.safeParse(parsed);
  if (!result.success) {
    const rootIssue = result.error.issues.find(
      (issue) => issue.code === "invalid_type" && issue.path.length === 0,
    );
    if (rootIssue) throw new Error(`MCP 配置 ${path} 必须是对象`);
    throw result.error;
  }
  const configuration = result.data;
  return {
    mcpServers: normalizeMcpServers(configuration.mcpServers ?? {}),
    toolNameOverrides: normalizeMcpToolNameOverrides(
      configuration.toolNameOverrides,
    ),
    freeformToolInputs: normalizeFreeformToolInputs(
      configuration.freeformToolInputs,
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
  if (!isRecord(server) || !("command" in server)) return server;
  const result = stdioServerSchema.safeParse(server);
  if (!result.success) throw result.error;
  return {
    ...result.data,
    args: result.data.args ?? [],
    stderr: "ignore",
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
