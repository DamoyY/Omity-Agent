import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import {
  normalizeMcpToolDescriptionOverrides,
  overrideMcpToolDescriptions,
  renameMcpTools,
} from "../../../src/infrastructure/mcp/toolOverrides";
import { DynamicStructuredTool } from "@langchain/core/tools";
import { createTestDirectory } from "../../support/artifacts";
import { join } from "node:path";
import { readMcpConfiguration } from "../../../src/infrastructure/mcp/config";

test("MCP config reads tool description override paths", () => {
  const root = createTestDirectory("mcp-description-config");
  const path = join(root, "mcp.yaml");
  try {
    writeFileSync(
      path,
      "toolDescriptionOverrides:\n  search: settings/tool-descriptions/search.md\n",
    );
    expect(readMcpConfiguration(path).toolDescriptionOverrides).toEqual({
      search: "settings/tool-descriptions/search.md",
    });
  } finally {
    rmSync(root, { recursive: true });
  }
});
test("MCP tool descriptions are loaded from configured paths after renaming", () => {
  const root = createTestDirectory("mcp-description");
  try {
    const directory = join(root, "settings", "tool-descriptions");
    mkdirSync(directory, { recursive: true });
    writeFileSync(
      join(directory, "search.md"),
      "Search the current web.\n\nUse precise terms.  \n",
    );
    const tools = renameMcpTools([tool("web__search")], { web__search: "search" });
    overrideMcpToolDescriptions(tools, { search: "settings/tool-descriptions/search.md" }, root);
    expect(tools[0]?.description).toBe("Search the current web.\n\nUse precise terms.");
  } finally {
    rmSync(root, { recursive: true });
  }
});
test("MCP tool description overrides reject missing tools", () => {
  expect(() =>
    overrideMcpToolDescriptions([tool("web__search")], { missing: "missing.md" }, "."),
  ).toThrow("MCP 工具描述覆盖配置引用了不存在的工具：missing");
});
test("MCP tool description overrides reject empty files", () => {
  const root = createTestDirectory("mcp-empty-description");
  try {
    const path = join(root, "empty.md");
    writeFileSync(path, " \n");
    expect(() => overrideMcpToolDescriptions([tool("search")], { search: path }, root)).toThrow(
      `MCP 工具 search 的描述覆盖文件不能为空：${path}`,
    );
  } finally {
    rmSync(root, { recursive: true });
  }
});
test("MCP tool description override paths must be non-empty strings", () => {
  expect(() => normalizeMcpToolDescriptionOverrides({ search: "" })).toThrow(
    "MCP 工具描述覆盖配置 settings/mcp.yaml.toolDescriptionOverrides.search 必须是非空路径",
  );
});
function tool(name: string) {
  return new DynamicStructuredTool({
    description: "Original description",
    func: () => Promise.resolve("ok"),
    name,
    schema: {
      additionalProperties: false,
      properties: {},
      type: "object" as const,
    },
  });
}
