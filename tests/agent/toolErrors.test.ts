import { expect, test } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { McpError } from "@modelcontextprotocol/sdk/types.js";
import { ToolExecutions } from "../../src/agent/toolExecutions";
import { createMcpToolFailureClient } from "../../src/infrastructure/mcp/toolFailures";
import { createToolInvoker } from "../../src/agent/toolExecution";
import { loadMcpTools } from "@langchain/mcp-adapters";
import { testSettings } from "../support/settings";
const rejection = "Rejected the request with HTTP 402. Check the input URL and parameters.";
test("MCP protocol errors reach the tool message without adapter wrappers", async () => {
  const output = await invokeMcpTool(() => Promise.reject(new McpError(-32_602, rejection)));
  expect(output.status).toBe("error");
  expect(output.name).toBe("search_query");
  expect(output.tool_call_id).toBe("call-1");
  expect(output.content).toBe(`MCP error -32602: ${rejection}`);
});
test("MCP error results reach the tool message without adapter wrappers", async () => {
  const output = await invokeMcpTool(() =>
    Promise.resolve({
      content: [{ text: rejection, type: "text" as const }],
      isError: true,
    }),
  );
  expect(output.status).toBe("error");
  expect(output.content).toBe(rejection);
});
test("manual cancellation stops the MCP request and returns elapsed time", async () => {
  let requestSignal: AbortSignal | undefined;
  const pending = Promise.withResolvers<McpToolResult>();
  let now = 0;
  const executions = new ToolExecutions({ now: () => now });
  executions.announce("call-1");
  const output = invokeMcpTool((_params, _schema, options) => {
    requestSignal = options?.signal;
    options?.signal?.addEventListener(
      "abort",
      () => {
        pending.reject(options.signal?.reason);
      },
      { once: true },
    );
    return pending.promise;
  }, executions);
  await Bun.sleep(0);
  now = 5600;
  expect(executions.cancel("call-1")).toBe(true);
  expect(requestSignal?.aborted).toBe(true);
  const cancelled = await output;
  expect(cancelled.content).toBe("工具运行 5.6 秒 后被用户手动终止。");
});
async function invokeMcpTool(callTool: McpCallTool, toolExecutions?: ToolExecutions) {
  const client = new Client({ name: "test", version: "1.0.0" });
  client.callTool = callTool;
  client.listTools = () =>
    Promise.resolve({
      tools: [
        {
          description: "Search",
          inputSchema: {
            additionalProperties: false,
            properties: {},
            type: "object" as const,
          },
          name: "search_query",
        },
      ],
    });
  const tools = await loadMcpTools("web", createMcpToolFailureClient(client), {
    useStandardContentBlocks: true,
  });
  const invoke = createToolInvoker(tools, {
    freeformToolParameters: new Map(),
    sessionId: "test-session",
    settings: testSettings("data"),
    toolExecutions,
  });
  return invoke(
    {
      args: {},
      id: "call-1",
      name: "search_query",
      type: "tool_call",
    },
    { configurable: { thread_id: "test-thread" } },
  );
}
type McpCallTool = Client["callTool"];
type McpToolResult = Awaited<ReturnType<McpCallTool>>;
