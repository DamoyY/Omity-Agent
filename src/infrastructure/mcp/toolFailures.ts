import { markMcpRequestCompleted, markMcpRequestStarted } from "../../agent/toolExecutions";
import type { loadMcpTools } from "@langchain/mcp-adapters";
type McpClient = Parameters<typeof loadMcpTools>[1];
export function createMcpToolFailureClient(client: McpClient): McpClient {
  return new Proxy(client, {
    get(target, property, receiver): unknown {
      const value: unknown = Reflect.get(target, property, receiver);
      if (property !== "callTool" || !isCallable(value)) {
        return value;
      }
      return async (...args: unknown[]) => {
        const signal = requestSignal(args);
        try {
          const request = Reflect.apply(value, target, args) as Promise<unknown>;
          markMcpRequestStarted(signal);
          const result: unknown = await request;
          if (isRecord(result) && result["isError"] === true) {
            throw new McpToolFailure(formatMcpContent(result["content"]));
          }
          return result;
        } catch (error) {
          if (error instanceof McpToolFailure) {
            throw error;
          }
          throw new McpToolFailure(errorMessage(error), error);
        } finally {
          markMcpRequestCompleted(signal);
        }
      };
    },
  });
}
function requestSignal(args: unknown[]) {
  const options = args[2];
  return isRecord(options) && options["signal"] instanceof AbortSignal
    ? options["signal"]
    : undefined;
}
class McpToolFailure extends Error {
  override readonly name = "ToolException";
  constructor(message: string, cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause });
  }
}
function isCallable(value: unknown): value is (this: unknown, ...args: unknown[]) => unknown {
  return typeof value === "function";
}
function errorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message || error.name;
  }
  return String(error);
}
function formatMcpContent(content: unknown) {
  if (!Array.isArray(content)) {
    return "MCP 工具返回了错误";
  }
  const text = content.map(formatMcpContentBlock).filter(Boolean).join("\n");
  return text || "MCP 工具返回了错误";
}
function formatMcpContentBlock(block: unknown) {
  if (!isRecord(block)) {
    return JSON.stringify(block);
  }
  if (block["type"] === "text" && typeof block["text"] === "string") {
    return block["text"];
  }
  return JSON.stringify(block);
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
