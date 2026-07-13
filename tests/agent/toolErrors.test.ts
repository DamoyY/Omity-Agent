import { loadMcpTools } from "@langchain/mcp-adapters";
import { McpError } from "@modelcontextprotocol/sdk/types.js";
import { expect, test } from "bun:test";
import { createToolInvoker } from "../../src/agent/toolExecution";
import { createMcpToolFailureClient } from "../../src/infrastructure/mcp/toolFailures";
import { testSettings } from "../support/settings";

const rejection =
  "Rejected the request with HTTP 402. Check the input URL and parameters.";

test("MCP protocol errors reach the tool message without adapter wrappers", async () => {
  const output = await invokeMcpTool(() =>
    Promise.reject(new McpError(-32602, rejection)),
  );

  expect(output.status).toBe("error");
  expect(output.name).toBe("search_query");
  expect(output.tool_call_id).toBe("call-1");
  expect(output.content).toBe(`MCP error -32602: ${rejection}`);
});

test("MCP error results reach the tool message without adapter wrappers", async () => {
  const output = await invokeMcpTool(() =>
    Promise.resolve({
      isError: true,
      content: [{ type: "text" as const, text: rejection }],
    }),
  );

  expect(output.status).toBe("error");
  expect(output.content).toBe(rejection);
});

async function invokeMcpTool(callTool: () => Promise<unknown>) {
  const client = {
    listTools: () =>
      Promise.resolve({
        tools: [
          {
            name: "search_query",
            description: "Search",
            inputSchema: {
              type: "object" as const,
              properties: {},
              additionalProperties: false,
            },
          },
        ],
      }),
    callTool,
  };
  const tools = await loadMcpTools(
    "web",
    createMcpToolFailureClient(client as never),
    { useStandardContentBlocks: true },
  );
  const invoke = createToolInvoker(tools, {
    settings: testSettings("data"),
    sessionId: "test-session",
    freeformToolParameters: new Map(),
  });
  return invoke(
    {
      id: "call-1",
      name: "search_query",
      args: {},
      type: "tool_call",
    },
    { configurable: { thread_id: "test-thread" } } as never,
  );
}
