import { afterEach, expect, test } from "bun:test";
import { expandEnvPlaceholders } from "../src/mcp";

const savedEnv = new Map<string, string | undefined>();

afterEach(() => {
  for (const [key, value] of savedEnv) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  savedEnv.clear();
});

function setEnv(key: string, value: string) {
  if (!savedEnv.has(key)) {
    savedEnv.set(key, process.env[key]);
  }
  process.env[key] = value;
}

test("mcp config expands env placeholders recursively", () => {
  setEnv("MCP_API_KEY", "secret");
  setEnv("MCP_TOKEN", "token");

  expect(
    expandEnvPlaceholders({
      mcpServers: {
        search: {
          transport: "stdio",
          command: "npx",
          args: ["server", "--key=${MCP_API_KEY}"],
          env: {
            API_KEY: "${MCP_API_KEY}",
          },
          headers: {
            Authorization: "Bearer ${MCP_TOKEN}",
          },
        },
      },
    }),
  ).toEqual({
    mcpServers: {
      search: {
        transport: "stdio",
        command: "npx",
        args: ["server", "--key=secret"],
        env: {
          API_KEY: "secret",
        },
        headers: {
          Authorization: "Bearer token",
        },
      },
    },
  });
});

test("mcp config reports missing env placeholders", () => {
  expect(() =>
    expandEnvPlaceholders({ env: { API_KEY: "${MISSING_MCP_KEY}" } }),
  ).toThrow(
    "MCP 配置 settings/mcp.yaml.env.API_KEY 引用了未设置的环境变量 MISSING_MCP_KEY",
  );
});
