import { expect, test } from "bun:test";
import { Protocol } from "@modelcontextprotocol/sdk/shared/protocol.js";
import { disableMcpRequestTimeout } from "../../src/infrastructure/mcpSupport/requestTimeout";

test("mcp request timeout is disabled", () => {
  disableMcpRequestTimeout();

  const prototype = Protocol.prototype as unknown as Record<string, unknown>;
  const setupTimeout = prototype["_setupTimeout"];
  if (typeof setupTimeout !== "function") {
    throw new Error("MCP SDK 缺少请求超时安装函数");
  }
  const timeoutInfo = new Map<unknown, unknown>();
  const invokeSetupTimeout = setupTimeout as (
    this: { _timeoutInfo: Map<unknown, unknown> },
    messageId: number,
    timeout: number,
    maxTotalTimeout: number | undefined,
    onTimeout: () => void,
  ) => void;
  invokeSetupTimeout.call(
    { _timeoutInfo: timeoutInfo },
    1,
    1,
    undefined,
    () => undefined,
  );

  expect(timeoutInfo.size).toBe(0);
});
