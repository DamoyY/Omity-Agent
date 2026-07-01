import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { MultiServerMCPClient } from "@langchain/mcp-adapters";
import YAML from "yaml";
import type { Logger } from "./logger";

const envPlaceholder = /\$\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g;

type McpServers = Record<string, unknown>;

type ZodIssueLike = {
  code?: string;
  expected?: unknown;
  message?: string;
  path?: Array<string | number>;
  received?: unknown;
  unionErrors?: Array<{ issues?: ZodIssueLike[] }>;
};

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
  };
  const mcpServers = normalizeMcpServers(
    parsed.mcpServers ?? parsed.servers ?? {},
  );
  const names = Object.keys(mcpServers);
  if (names.length === 0) {
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
    const tools = await client.getTools();
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

function collectReadableZodIssues(error: unknown): string[] {
  const issues = getZodIssues(error);
  if (issues.length === 0) {
    return [];
  }
  return [...new Set(flattenBestIssues(issues).map(formatZodIssue))];
}

function getZodIssues(error: unknown): ZodIssueLike[] {
  if (isRecord(error) && Array.isArray(error["issues"])) {
    return error["issues"].filter(isZodIssueLike);
  }
  return [];
}

function flattenBestIssues(issues: ZodIssueLike[]): ZodIssueLike[] {
  return issues.flatMap((issue) => {
    if (issue.code !== "invalid_union" || issue.unionErrors === undefined) {
      return [issue];
    }
    const candidates = issue.unionErrors
      .map((unionError) => flattenBestIssues(unionError.issues ?? []))
      .filter((candidate) => candidate.length > 0);
    const best = candidates.toSorted(
      (left, right) => left.length - right.length,
    )[0];
    return best ?? [issue];
  });
}

function formatZodIssue(issue: ZodIssueLike): string {
  const path = formatIssuePath(issue.path);
  if (issue.path?.at(-1) === "args" && issue.expected === "array") {
    return `${path} 应为字符串数组；如无参数可省略（当前为 ${formatValue(issue.received)}）`;
  }
  if (issue.path?.at(-1) === "command" && issue.expected === "string") {
    return `${path} 应为可执行命令字符串`;
  }
  if (issue.path?.at(-1) === "url" && issue.expected === "string") {
    return `${path} 应为 HTTP/SSE MCP 服务地址`;
  }
  return `${path} ${issue.message ?? "配置无效"}`;
}

function formatIssuePath(path: Array<string | number> | undefined): string {
  if (path === undefined || path.length === 0) {
    return "settings/mcp.yaml";
  }
  return `settings/mcp.yaml.${path.join(".")}`;
}

function formatValue(value: unknown): string {
  if (value === undefined) {
    return "未填写";
  }
  return JSON.stringify(value);
}

function isZodIssueLike(value: unknown): value is ZodIssueLike {
  return isRecord(value);
}
