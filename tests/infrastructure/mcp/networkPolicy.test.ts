import { expect, test } from "bun:test";
import { normalizeMcpServers } from "../../../src/infrastructure/mcp/config";

test("mcp http config disables dependency reconnection and transport fallback", () => {
  expect(
    normalizeMcpServers({
      remote: {
        automaticSSEFallback: true,
        reconnect: { enabled: true, maxAttempts: 5 },
        transport: "http",
        url: "https://example.com/mcp",
      },
    }),
  ).toEqual({
    remote: {
      automaticSSEFallback: false,
      reconnect: { enabled: false, maxAttempts: 0 },
      transport: "http",
      url: "https://example.com/mcp",
    },
  });
});
test("mcp config rejects transports whose internal reconnect cannot be disabled", () => {
  expect(() =>
    normalizeMcpServers({
      remote: { transport: "sse", url: "https://example.com/sse" },
    }),
  ).toThrow("MCP SSE transport 无法关闭底层自动重连，请改用 http");
});
test("mcp config rejects auth providers that automatically retry requests", () => {
  expect(() =>
    normalizeMcpServers({
      remote: {
        authProvider: {},
        transport: "http",
        url: "https://example.com/mcp",
      },
    }),
  ).toThrow("MCP authProvider 会在认证失败后自动重试，请改用静态 headers");
});
