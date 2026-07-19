import { type LoadedMcp, loadServerTools } from "../../../src/infrastructure/mcp/loadTools";
import { expect, mock, test } from "bun:test";
import { AppMcp } from "../../../src/app/runtime/mcp";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";

test("MCP adapter clients initialize sequentially", async () => {
  const firstReady = Promise.withResolvers<void>();
  const requested: string[] = [];
  const loading = loadServerTools(
    {
      async getClient(name) {
        requested.push(name);
        if (name === "first") {
          await firstReady.promise;
        }
        return toolClient(name);
      },
    },
    ["first", "second"],
  );
  await Bun.sleep(0);
  expect(requested).toEqual(["first"]);
  firstReady.resolve();
  expect(await loading).toHaveLength(2);
  expect(requested).toEqual(["first", "second"]);
});
test("all App consumers share one MCP lifecycle", async () => {
  const initialized = Promise.withResolvers<LoadedMcp>();
  const close = mock(() => Promise.resolve());
  const initialize = mock(() => initialized.promise);
  const mcp = new AppMcp(initialize);
  const first = mcp.load();
  const second = mcp.load();
  const closing = mcp.close();
  expect(first).toBe(second);
  expect(initialize).toHaveBeenCalledTimes(1);
  expect(close).not.toHaveBeenCalled();
  initialized.resolve(loadedMcp(close));
  await Promise.all([first, second, closing]);
  await mcp.close();
  expect(close).toHaveBeenCalledTimes(1);
  expect(mcp.load()).rejects.toThrow("App 正在关闭");
});
test("a failed App MCP initialization can be retried", async () => {
  const close = mock(() => Promise.resolve());
  let attempts = 0;
  const mcp = new AppMcp(() => {
    attempts += 1;
    return attempts === 1
      ? Promise.reject(new Error("initialization failed"))
      : Promise.resolve(loadedMcp(close));
  });
  expect(mcp.load()).rejects.toThrow("initialization failed");
  expect(await mcp.load()).toEqual(expect.objectContaining({ close }));
  expect(attempts).toBe(2);
  await mcp.close();
});
function toolClient(name: string) {
  const client = new Client({ name, version: "1.0.0" });
  client.listTools = () =>
    Promise.resolve({
      tools: [
        {
          description: name,
          inputSchema: { properties: {}, type: "object" as const },
          name: "tool",
        },
      ],
    });
  return client;
}
function loadedMcp(close: LoadedMcp["close"]): LoadedMcp {
  return {
    close,
    freeformToolParameters: new Map(),
    modelTools: [],
    tools: [],
  };
}
