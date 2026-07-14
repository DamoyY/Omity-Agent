import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { StructuredToolInterface } from "@langchain/core/tools";
import { loadMcpTools, MultiServerMCPClient } from "@langchain/mcp-adapters";
import type { Logger } from "../logging/logger";
import { readMcpConfiguration } from "./config";
import { configureFreeformMcpTools } from "./freeformInputs";
import { renameMcpTools } from "./nameOverrides";
import { disableMcpRequestTimeout } from "./requestTimeout";
import { collectReadableZodIssues } from "./schemaIssues";
import { createMcpToolFailureClient } from "./toolFailures";

interface LoadedMcp {
  tools: StructuredToolInterface[];
  modelTools: StructuredToolInterface[];
  freeformToolParameters: ReadonlyMap<string, string>;
  close: () => Promise<void>;
}

export function createMcpLoadError(error: unknown): Error {
  const details = collectReadableZodIssues(error);
  if (details.length === 0) {
    const message = error instanceof Error ? error.message : String(error);
    return new Error(`MCP 工具加载失败：${message}`, { cause: error });
  }
  return new Error(["MCP 配置校验失败：", ...details.map((detail) => `- ${detail}`)].join("\n"), {
    cause: error,
  });
}

export async function loadMcp(root: string, logger: Logger): Promise<LoadedMcp> {
  const path = resolve(root, "settings", "mcp.yaml");
  if (!existsSync(path)) {
    logger.info("MCP 配置不存在，跳过工具加载", { path });
    return emptyMcp();
  }
  const configuration = readMcpConfiguration(path);
  const names = Object.keys(configuration.mcpServers);
  validateConfiguredServers(configuration, names);
  if (names.length === 0) {
    logger.info("MCP 未配置服务器，Agent 将不带工具运行");
    return emptyMcp();
  }
  return connectMcp(configuration, names, logger);
}

async function connectMcp(
  configuration: ReturnType<typeof readMcpConfiguration>,
  names: string[],
  logger: Logger,
): Promise<LoadedMcp> {
  const end = logger.child("MCP 工具加载");
  let client: MultiServerMCPClient | undefined;
  try {
    disableMcpRequestTimeout();
    client = new MultiServerMCPClient({
      mcpServers: configuration.mcpServers,
      throwOnLoadError: false,
      prefixToolNameWithServerName: true,
    } as never);
    const tools = renameMcpTools(
      await loadServerTools(client, names),
      configuration.toolNameOverrides,
    );
    const configured = configureFreeformMcpTools(tools, configuration.freeformToolInputs);
    logger.info("已加载 MCP 工具", {
      servers: names,
      tools: tools.map((tool) => tool.name),
    });
    const connectedClient = client;
    return {
      tools,
      modelTools: configured.modelTools,
      freeformToolParameters: configured.parameters,
      close: () => connectedClient.close(),
    };
  } catch (error) {
    if (client !== undefined) await client.close();
    throw createMcpLoadError(error);
  } finally {
    end();
  }
}

async function loadServerTools(client: MultiServerMCPClient, names: string[]) {
  return (
    await Promise.all(
      names.map(async (name) => {
        const serverClient = await client.getClient(name);
        if (serverClient === undefined) {
          throw new Error(`MCP 服务器客户端未建立：${name}`);
        }
        return loadMcpTools(name, createMcpToolFailureClient(serverClient), {
          throwOnLoadError: false,
          prefixToolNameWithServerName: true,
          useStandardContentBlocks: true,
        });
      }),
    )
  ).flat();
}

function validateConfiguredServers(
  configuration: ReturnType<typeof readMcpConfiguration>,
  names: string[],
) {
  if (names.length > 0) return;
  if (Object.keys(configuration.toolNameOverrides).length > 0) {
    throw new Error("MCP 工具重命名配置需要至少配置一个 MCP 服务器");
  }
  if (configuration.freeformToolInputs.length > 0) {
    throw new Error("MCP free-form 工具配置需要至少配置一个 MCP 服务器");
  }
}

function emptyMcp(): LoadedMcp {
  return {
    tools: [],
    modelTools: [],
    freeformToolParameters: new Map(),
    close: () => Promise.resolve(),
  };
}
