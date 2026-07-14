import { loadMcpTools } from "@langchain/mcp-adapters";
import { McpError } from "@modelcontextprotocol/sdk/types.js";
import { expect, test } from "bun:test";
import { createToolInvoker } from "../../src/agent/toolExecution";
import { ToolExecutions } from "../../src/agent/toolExecutions";
import { createMcpToolFailureClient } from "../../src/infrastructure/mcp/toolFailures";
import { testSettings } from "../support/settings";
const rejection = "Rejected the request with HTTP 402. Check the input URL and parameters.";
test("MCP protocol errors reach the tool message without adapter wrappers", async () => {
  const output = await invokeMcpTool(() => Promise.reject(new McpError(-32602, rejection)));
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
test("manual cancellation stops the MCP request and returns elapsed time", async () => {
  let requestSignal: AbortSignal | undefined;
  const pending = Promise.withResolvers<unknown>();
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
  expect((await output).content).toBe("工具运行 5.6 秒 后被用户手动终止。");
});
async function invokeMcpTool(
  callTool: (
    params?: unknown,
    schema?: unknown,
    options?: { signal?: AbortSignal },
  ) => Promise<unknown>,
  toolExecutions?: ToolExecutions,
) {
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
  const tools = await loadMcpTools("web", createMcpToolFailureClient(client as never), {
    useStandardContentBlocks: true,
  });
  const invoke = createToolInvoker(tools, {
    settings: testSettings("data"),
    sessionId: "test-session",
    freeformToolParameters: new Map(),
    toolExecutions,
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
