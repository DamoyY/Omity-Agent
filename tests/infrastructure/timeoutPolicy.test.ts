import { expect, test } from "bun:test";
import { Protocol } from "@modelcontextprotocol/sdk/shared/protocol.js";
import { disableMcpRequestTimeout } from "../../src/infrastructure/mcp/requestTimeout";
test("mcp request timeout is disabled", () => {
  disableMcpRequestTimeout();
  const setupTimeout: unknown = Reflect.get(Protocol.prototype, "_setupTimeout");
  if (typeof setupTimeout !== "function") {
    throw new Error("MCP SDK 缺少请求超时安装函数");
  }
  const timeoutInfo = new Map<unknown, unknown>();
  setupTimeout.call({ _timeoutInfo: timeoutInfo }, 1, 1, undefined, () => undefined);
  expect(timeoutInfo.size).toBe(0);
});
