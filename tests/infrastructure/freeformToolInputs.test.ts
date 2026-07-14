import {
  AIMessageChunk,
  type RawInputToolCallChunk,
  type ToolCall,
} from "@langchain/core/messages";
import {
  configureFreeformMcpTools,
  normalizeFreeformToolInputs,
} from "../../src/infrastructure/mcp/freeformInputs";
import { expect, test } from "bun:test";
import { ChatOpenAIResponses } from "@langchain/openai";
import { DynamicStructuredTool } from "@langchain/core/tools";
import { materializeFreeformToolCall } from "../../src/agent/toolExecution";
test("normalizes free-form tool names", () => {
  expect(normalizeFreeformToolInputs(undefined)).toEqual([]);
  expect(normalizeFreeformToolInputs(["apply_patch"])).toEqual(["apply_patch"]);
  expect(() => normalizeFreeformToolInputs("apply_patch")).toThrow(
    "MCP free-form 工具配置 settings/mcp.yaml.freeformToolInputs 必须是数组",
  );
  expect(() => normalizeFreeformToolInputs(["apply_patch", "apply_patch"])).toThrow(
    "MCP free-form 工具配置包含重复工具：apply_patch",
  );
});
test("creates a custom model tool from the only string parameter", () => {
  const original = makeTool("apply_patch", {
    patch: { type: "string" },
  });
  const untouched = makeTool("search", { query: { type: "string" } });
  const configured = configureFreeformMcpTools([original, untouched], ["apply_patch"]);
  const [modelTool] = configured.modelTools;
  if (!modelTool) {
    throw new Error("缺少 apply_patch 工具");
  }
  expect(configured.parameters).toEqual(new Map([["apply_patch", "patch"]]));
  expect(modelTool).not.toBe(original);
  expect(toolMetadata(modelTool)).toEqual({
    customTool: {
      description: "apply_patch description",
      format: { type: "text" },
      name: "apply_patch",
    },
  });
  expect(configured.modelTools[1]).toBe(untouched);
  const model = new ChatOpenAIResponses({ apiKey: "test", model: "test" });
  expect(model.invocationParams({ tools: [modelTool] }).tools).toEqual([
    {
      description: "apply_patch description",
      format: { type: "text" },
      name: "apply_patch",
      type: "custom",
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
          patch: { type: "string" },
          path: { type: "string" },
        }),
      ],
      ["multi"],
    ),
  ).toThrow("MCP free-form 工具 multi 必须恰好声明一个输入参数，实际为 2 个");
  expect(() =>
    configureFreeformMcpTools([makeTool("numeric", { count: { type: "number" } })], ["numeric"]),
  ).toThrow("MCP free-form 工具 numeric 的唯一输入参数 count 必须是字符串");
});
test("maps custom tool text without changing its contents", () => {
  const input = '*** Begin Patch\n+const value = \\"quoted\\";\\path\n';
  const call = {
    args: { input },
    id: "call-1",
    isCustomTool: true,
    name: "apply_patch",
    type: "tool_call",
  } as ToolCall;
  const executable = materializeFreeformToolCall(call, new Map([["apply_patch", "patch"]]));
  expect(executable.args).toEqual({ patch: input });
  expect(call.args).toEqual({ input });
});
test("maps free-form input after streaming tool-call aggregation", () => {
  const input = "*** Begin Patch\n*** End Patch\n";
  const rawCall: RawInputToolCallChunk = {
    args: input,
    id: "call-streamed",
    index: 0,
    isCustomTool: true,
    name: "apply_patch",
    type: "tool_call_chunk",
  };
  const chunk = new AIMessageChunk({
    content: "",
    tool_call_chunks: [rawCall],
  });
  const call = chunk.tool_calls?.[0];
  if (!call) {
    throw new Error("缺少流式聚合后的 apply_patch 调用");
  }
  const executable = materializeFreeformToolCall(call, new Map([["apply_patch", "patch"]]));
  expect(call.args).toEqual({ input });
  expect(executable.args).toEqual({ patch: input });
});
test("does not remap structured hook calls", () => {
  const call: ToolCall = {
    args: { patch: "content" },
    id: "hook-1",
    name: "apply_patch",
    type: "tool_call",
  };
  expect(materializeFreeformToolCall(call, new Map([["apply_patch", "patch"]]))).toBe(call);
});
function makeTool(name: string, properties: Record<string, { type: "number" | "string" }>) {
  return new DynamicStructuredTool({
    description: `${name} description`,
    func: () => Promise.resolve("ok"),
    name,
    schema: {
      additionalProperties: false,
      properties,
      required: Object.keys(properties),
      type: "object" as const,
    },
  });
}
function toolMetadata(tool: unknown) {
  return typeof tool === "object" && tool !== null && "metadata" in tool
    ? tool.metadata
    : undefined;
}
