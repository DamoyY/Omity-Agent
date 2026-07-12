import { expect, test } from "bun:test";
import type { ToolCall } from "@langchain/core/messages";
import { DynamicStructuredTool } from "@langchain/core/tools";
import { ChatOpenAIResponses } from "@langchain/openai";
import { materializeFreeformToolCall } from "../../src/agent/toolExecution";
import {
  configureFreeformMcpTools,
  normalizeFreeformToolInputs,
} from "../../src/infrastructure/mcpSupport/freeformToolInputs";

test("normalizes free-form tool names", () => {
  expect(normalizeFreeformToolInputs(undefined)).toEqual([]);
  expect(normalizeFreeformToolInputs(["apply_patch"])).toEqual(["apply_patch"]);
  expect(() => normalizeFreeformToolInputs("apply_patch")).toThrow(
    "MCP free-form 工具配置 settings/mcp.yaml.freeformToolInputs 必须是数组",
  );
  expect(() =>
    normalizeFreeformToolInputs(["apply_patch", "apply_patch"]),
  ).toThrow("MCP free-form 工具配置包含重复工具：apply_patch");
});

test("creates a custom model tool from the only string parameter", () => {
  const original = makeTool("apply_patch", {
    patch: { type: "string" },
  });
  const untouched = makeTool("search", { query: { type: "string" } });

  const configured = configureFreeformMcpTools(
    [original, untouched],
    ["apply_patch"],
  );
  const modelTool = configured.modelTools[0];
  if (!modelTool) throw new Error("缺少 apply_patch 模型工具");

  expect(configured.parameters).toEqual(new Map([["apply_patch", "patch"]]));
  expect(modelTool).not.toBe(original);
  expect(toolMetadata(modelTool)).toEqual({
    customTool: {
      name: "apply_patch",
      description: "apply_patch description",
      format: { type: "text" },
    },
  });
  expect(configured.modelTools[1]).toBe(untouched);

  const model = new ChatOpenAIResponses({ model: "test", apiKey: "test" });
  expect(model.invocationParams({ tools: [modelTool] }).tools).toEqual([
    {
      type: "custom",
      name: "apply_patch",
      description: "apply_patch description",
      format: { type: "text" },
    },
  ]);
});

test("rejects invalid free-form MCP tool schemas", () => {
  expect(() => configureFreeformMcpTools([], ["missing"])).toThrow(
    "MCP free-form 工具配置引用了不存在的工具：missing",
  );
  expect(() =>
    configureFreeformMcpTools(
      [
        makeTool("multi", {
          path: { type: "string" },
          patch: { type: "string" },
        }),
      ],
      ["multi"],
    ),
  ).toThrow("MCP free-form 工具 multi 必须恰好声明一个输入参数，实际为 2 个");
  expect(() =>
    configureFreeformMcpTools(
      [makeTool("numeric", { count: { type: "number" } })],
      ["numeric"],
    ),
  ).toThrow("MCP free-form 工具 numeric 的唯一输入参数 count 必须是字符串");
});

test("maps custom tool text without changing its contents", () => {
  const input = '*** Begin Patch\n+const value = \\"quoted\\";\\path\n';
  const call = {
    name: "apply_patch",
    id: "call-1",
    type: "tool_call",
    args: { input },
    isCustomTool: true,
  } as ToolCall;

  const executable = materializeFreeformToolCall(
    call,
    new Map([["apply_patch", "patch"]]),
  );

  expect(executable.args).toEqual({ patch: input });
  expect(call.args).toEqual({ input });
});

test("does not remap structured hook calls", () => {
  const call: ToolCall = {
    name: "apply_patch",
    id: "hook-1",
    type: "tool_call",
    args: { patch: "content" },
  };

  expect(
    materializeFreeformToolCall(call, new Map([["apply_patch", "patch"]])),
  ).toBe(call);
});

function makeTool(
  name: string,
  properties: Record<string, { type: "number" | "string" }>,
) {
  return new DynamicStructuredTool({
    name,
    description: `${name} description`,
    schema: {
      type: "object" as const,
      properties,
      required: Object.keys(properties),
      additionalProperties: false,
    },
    func: () => Promise.resolve("ok"),
  });
}

function toolMetadata(tool: unknown) {
  return typeof tool === "object" && tool !== null && "metadata" in tool
    ? tool.metadata
    : undefined;
}
