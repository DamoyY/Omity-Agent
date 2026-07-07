import { afterEach, expect, test } from "bun:test";
import {
  expandEnvPlaceholders,
  normalizeMcpServers,
} from "../src/infrastructure/mcp";
import {
  normalizeMcpToolNameOverrides,
  renameMcpTools,
} from "../src/infrastructure/mcpSupport/toolNameOverrides";
import { mcpErrorResultAsOutput } from "../src/infrastructure/mcpSupport/toolErrorOutput";

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

test("mcp stdio config allows omitted or blank args", () => {
  expect(
    normalizeMcpServers({
      omitted: {
        transport: "stdio",
        command: "server.exe",
      },
      blank: {
        transport: "stdio",
        command: "server.exe",
        args: null,
      },
    }),
  ).toEqual({
    omitted: {
      transport: "stdio",
      command: "server.exe",
      args: [],
    },
    blank: {
      transport: "stdio",
      command: "server.exe",
      args: [],
    },
  });
});

test("mcp config normalizes tool name overrides", () => {
  expect(
    normalizeMcpToolNameOverrides({
      web__search: "search",
      web__crawl: "crawl",
    }),
  ).toEqual({
    web__search: "search",
    web__crawl: "crawl",
  });
});

test("mcp tool name overrides rename loaded tools", () => {
  const tools = toolNames(["web__search", "web__crawl"]);

  expect(
    renameMcpTools(tools, {
      web__search: "search",
    }).map((tool) => tool.name),
  ).toEqual(["search", "web__crawl"]);
});

test("mcp tool name overrides report missing source tools", () => {
  expect(() =>
    renameMcpTools(toolNames(["web__search"]), {
      web__missing: "missing",
    }),
  ).toThrow("MCP 工具重命名配置引用了不存在的工具：web__missing");
});

test("mcp tool name overrides report renamed conflicts", () => {
  expect(() =>
    renameMcpTools(toolNames(["web__search", "web__crawl"]), {
      web__search: "web__crawl",
    }),
  ).toThrow("MCP 工具重命名后名称冲突：web__crawl");
});

test("mcp error result is converted to normal tool output", () => {
  expect(
    mcpErrorResultAsOutput(
      {
        isError: true,
        content: [{ type: "text", text: "bad request" }],
      },
      "web",
      "search",
    ),
  ).toEqual({
    isError: false,
    content: [
      {
        type: "text",
        text: "MCP tool 'search' on server 'web' returned an error: bad request",
      },
    ],
  });
});

test("mcp successful result is not changed", () => {
  const result = {
    content: [{ type: "text", text: "ok" }],
  };

  expect(mcpErrorResultAsOutput(result, "web", "search")).toBe(result);
});

function toolNames(names: string[]) {
  return names.map((name) => ({ name })) as never;
}
