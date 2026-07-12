import {
  AIMessage,
  ToolMessage,
  type ToolCall,
} from "@langchain/core/messages";
import type { StructuredToolInterface } from "@langchain/core/tools";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import type { InvokeGraphTool } from "../hooks/graph/node";
import { requireCallId } from "../hooks/plan";
import { redirectLargeToolOutput } from "../runtime/largeOutput";
import type { Settings } from "../types";

interface ToolInvokerOptions {
  settings: Settings;
  sessionId: string;
  freeformToolParameters: ReadonlyMap<string, string>;
}

export function createToolInvoker(
  tools: StructuredToolInterface[],
  options: ToolInvokerOptions,
): InvokeGraphTool {
  const toolNode = new ToolNode(tools);
  return async (call, state, config) => {
    const callId = requireCallId(call);
    const executableCall = materializeFreeformToolCall(
      call,
      options.freeformToolParameters,
    );
    const synthetic = new AIMessage({
      content: "",
      tool_calls: [executableCall],
    });
    const result: unknown = await toolNode.invoke(
      { ...state, messages: [...state.messages, synthetic] },
      config,
    );
    const output = singleToolOutput(result, callId);
    return redirectLargeToolOutput(output, {
      dataDir: options.settings.paths.dataDir,
      maxTokens: options.settings.toolOutput.maxTokens,
      sessionId: options.sessionId,
      outputId: callId,
    });
  };
}

export function materializeFreeformToolCall(
  call: ToolCall,
  parameters: ReadonlyMap<string, string>,
): ToolCall {
  const parameter = parameters.get(call.name);
  if (!parameter || !isCustomToolCall(call)) return call;

  const args: unknown = call.args;
  const input = isRecord(args) ? args["input"] : undefined;
  if (typeof input !== "string") {
    throw new Error(`MCP free-form 工具 ${call.name} 没有返回字符串输入`);
  }
  return { ...call, args: { [parameter]: input } };
}

function isCustomToolCall(call: ToolCall) {
  return isRecord(call) && call["isCustomTool"] === true;
}

function singleToolOutput(value: unknown, callId: string) {
  if (!isRecord(value) || !Array.isArray(value["messages"])) {
    throw new Error("工具节点没有返回 messages");
  }
  const messages = value["messages"];
  if (messages.length !== 1 || !ToolMessage.isInstance(messages[0])) {
    throw new Error("工具节点必须返回一个 ToolMessage");
  }
  if (messages[0].tool_call_id !== callId) {
    throw new Error(`工具节点返回了不匹配的调用 ID：${callId}`);
  }
  return messages[0];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
