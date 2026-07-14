import { ToolExecutions, markMcpRequestStarted } from "../../src/agent/toolExecutions";
import { expect, test } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
test("aborting a cancellable MCP request sends notifications/cancelled", async () => {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test-client", version: "1" });
  const server = new McpServer({ name: "test-server", version: "1" });
  const cancellation = Promise.withResolvers<unknown>();
  server.registerTool(
    "wait",
    {},
    (extra) =>
      new Promise((_resolve, reject) => {
        extra.signal.addEventListener(
          "abort",
          () => {
            cancellation.resolve(extra.signal.reason);
            reject(new Error("cancelled"));
          },
          { once: true },
        );
      }),
  );
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  try {
    const executions = new ToolExecutions();
    executions.announce("call-1");
    const execution = executions.begin("call-1");
    const request = client.callTool({ arguments: {}, name: "wait" }, undefined, {
      signal: execution.signal,
    });
    markMcpRequestStarted(execution.signal);
    await Bun.sleep(0);
    expect(executions.cancel("call-1")).toBe(true);
    let rejection: unknown;
    try {
      await request;
    } catch (error) {
      rejection = error;
    }
    expect(rejection).toBeInstanceOf(Error);
    expect((rejection as Error).message).toContain("用户手动终止工具");
    expect(await cancellation.promise).toBe("Error: 用户手动终止工具");
    execution.complete();
  } finally {
    await Promise.all([client.close(), server.close()]);
  }
});
