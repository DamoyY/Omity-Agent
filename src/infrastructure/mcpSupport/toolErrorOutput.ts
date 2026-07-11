import type { loadMcpTools } from "@langchain/mcp-adapters";

type McpClient = Parameters<typeof loadMcpTools>[1];

export function createMcpErrorOutputClient(
  client: McpClient,
  serverName: string,
): McpClient {
  return new Proxy(client, {
    get(target, property, receiver): unknown {
      const value: unknown = Reflect.get(target, property, receiver);
      if (property !== "callTool" || !isCallable(value)) {
        return value;
      }
      return async (...args: unknown[]) => {
        const result: unknown = await Reflect.apply(value, target, args);
        return mcpErrorResultAsOutput(
          result,
          serverName,
          extractToolName(args[0]),
        );
      };
    },
  });
}

function isCallable(
  value: unknown,
): value is (this: unknown, ...args: unknown[]) => unknown {
  return typeof value === "function";
}

export function mcpErrorResultAsOutput(
  result: unknown,
  serverName: string,
  toolName: string,
): unknown {
  if (!isRecord(result) || result["isError"] !== true) return result;
  return {
    ...result,
    content: [
      {
        type: "text",
        text: `MCP tool '${toolName}' on server '${serverName}' returned an error: ${formatMcpContent(result["content"])}`,
      },
    ],
  };
}

function extractToolName(request: unknown) {
  if (isRecord(request) && typeof request["name"] === "string") {
    return request["name"];
  }
  return "unknown";
}

function formatMcpContent(content: unknown) {
  if (!Array.isArray(content)) return "MCP 工具返回了错误";
  const text = content.map(formatMcpContentBlock).filter(Boolean).join("\n");
  return text || "MCP 工具返回了错误";
}

function formatMcpContentBlock(block: unknown) {
  if (!isRecord(block)) return JSON.stringify(block);
  if (block["type"] === "text" && typeof block["text"] === "string") {
    return block["text"];
  }
  return JSON.stringify(block);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
