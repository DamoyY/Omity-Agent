import {
  AIMessage,
  ToolMessage,
  type ToolCall,
} from "@langchain/core/messages";
import type { StructuredToolInterface } from "@langchain/core/tools";
import { isGraphInterrupt } from "@langchain/langgraph";
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
  const toolNode = new ToolNode(tools, { handleToolErrors: false });
  return async (call, state, config) => {
    const callId = requireCallId(call);
    const customToolCall = isFreeformModelToolCall(
      call,
      options.freeformToolParameters,
    );
    const executableCall = materializeFreeformToolCall(
      call,
      options.freeformToolParameters,
    );
    const synthetic = new AIMessage({
      content: "",
      tool_calls: [executableCall],
    });
    let output: ToolMessage;
    try {
      const result: unknown = await toolNode.invoke(
        { ...state, messages: [...state.messages, synthetic] },
        config,
      );
      output = singleToolOutput(result, callId);
    } catch (error) {
      if (isGraphInterrupt(error) || config.signal?.aborted) throw error;
      output = toolErrorOutput(call, callId, error);
    }
    const normalizedOutput = await redirectLargeToolOutput(output, {
      dataDir: options.settings.paths.dataDir,
      maxTokens: options.settings.toolOutput.maxTokens,
      sessionId: options.sessionId,
      outputId: callId,
    });
    return customToolCall
      ? markCustomToolOutput(normalizedOutput)
      : normalizedOutput;
  };
}

function toolErrorOutput(call: ToolCall, callId: string, error: unknown) {
  return new ToolMessage({
    status: "error",
    name: call.name,
    tool_call_id: callId,
    content:
      error instanceof Error ? error.message || error.name : String(error),
  });
}

export function materializeFreeformToolCall(
  call: ToolCall,
  parameters: ReadonlyMap<string, string>,
): ToolCall {
  const parameter = parameters.get(call.name);
  if (!parameter) return call;

  if (!isFreeformModelToolCall(call, parameters)) return call;

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

function isFreeformModelToolCall(
  call: ToolCall,
  parameters: ReadonlyMap<string, string>,
) {
  return (
    parameters.has(call.name) &&
    (isCustomToolCall(call) || isRawFreeformInput(call.args))
  );
}

function markCustomToolOutput(message: ToolMessage) {
  const artifact: unknown = message.artifact;
  return new ToolMessage({
    content: message.content,
    tool_call_id: message.tool_call_id,
    name: message.name,
    id: message.id,
    additional_kwargs: { ...message.additional_kwargs, customTool: true },
    response_metadata: message.response_metadata,
    artifact,
    status: message.status,
    metadata: message.metadata,
  });
}

function isRawFreeformInput(args: unknown) {
  return (
    isRecord(args) &&
    Object.keys(args).length === 1 &&
    typeof args["input"] === "string"
  );
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
