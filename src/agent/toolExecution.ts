import { AIMessage, type ToolCall, ToolMessage } from "@langchain/core/messages";
import { type LangGraphRunnableConfig, isGraphInterrupt } from "@langchain/langgraph";
import type { Settings } from "../types";
import type { StructuredToolInterface } from "@langchain/core/tools";
import type { ToolExecutions } from "./toolExecutions";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { redirectLargeToolOutput } from "../runtime/largeOutput";
import { requireCallId } from "../hooks/plan";

interface ToolInvokerOptions {
  settings: Settings;
  sessionId: string;
  freeformToolParameters: ReadonlyMap<string, string>;
  toolExecutions?: ToolExecutions;
}
type ToolInvoker = (call: ToolCall, config: LangGraphRunnableConfig) => Promise<ToolMessage>;
export function createToolInvoker(
  tools: StructuredToolInterface[],
  options: ToolInvokerOptions,
): ToolInvoker {
  const toolNode = new ToolNode(tools, { handleToolErrors: false });
  return async (call, config) => {
    const callId = requireCallId(call);
    const execution = options.toolExecutions?.begin(callId, config.signal);
    const customToolCall = isFreeformModelToolCall(call, options.freeformToolParameters);
    const executableCall = materializeFreeformToolCall(call, options.freeformToolParameters);
    const synthetic = new AIMessage({
      content: "",
      tool_calls: [executableCall],
    });
    let output: ToolMessage;
    try {
      const result: unknown = await toolNode.invoke(
        { messages: [synthetic] },
        execution ? { ...config, signal: execution.signal } : config,
      );
      output = singleToolOutput(result, callId);
    } catch (error) {
      const durationMs = execution?.cancellationDurationMs();
      if (durationMs !== undefined) {
        output = cancelledToolOutput(call, callId, durationMs);
      } else {
        if (isGraphInterrupt(error) || config.signal?.aborted) {
          throw error;
        }
        output = toolErrorOutput(call, callId, error);
      }
    } finally {
      execution?.complete();
    }
    const normalizedOutput = await redirectLargeToolOutput(output, {
      dataDir: options.settings.paths.dataDir,
      maxTokens: options.settings.toolOutput.maxTokens,
      outputId: callId,
      sessionId: options.sessionId,
    });
    return customToolCall ? markCustomToolOutput(normalizedOutput) : normalizedOutput;
  };
}
function cancelledToolOutput(call: ToolCall, callId: string, durationMs: number) {
  return new ToolMessage({
    content: `工具运行 ${formatDuration(durationMs)} 后被用户手动终止。`,
    name: call.name,
    status: "error",
    tool_call_id: callId,
  });
}
export function formatDuration(durationMs: number) {
  if (durationMs < 1000) {
    return `${Math.round(durationMs).toString()} 毫秒`;
  }
  const seconds = durationMs / 1000;
  if (seconds < 60) {
    return `${Number(seconds.toFixed(1)).toString()} 秒`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainder = Math.round(seconds % 60);
  return remainder === 0
    ? `${minutes.toString()} 分钟`
    : `${minutes.toString()} 分 ${remainder.toString()} 秒`;
}
function toolErrorOutput(call: ToolCall, callId: string, error: unknown) {
  return new ToolMessage({
    content: error instanceof Error ? error.message || error.name : String(error),
    name: call.name,
    status: "error",
    tool_call_id: callId,
  });
}
export function materializeFreeformToolCall(
  call: ToolCall,
  parameters: ReadonlyMap<string, string>,
): ToolCall {
  const parameter = parameters.get(call.name);
  if (!parameter) {
    return call;
  }
  if (!isFreeformModelToolCall(call, parameters)) {
    return call;
  }
  const { args } = call;
  const input = isRecord(args) ? args["input"] : undefined;
  if (typeof input !== "string") {
    throw new Error(`MCP free-form 工具 ${call.name} 没有返回字符串输入`);
  }
  return { ...call, args: { [parameter]: input } };
}
function isCustomToolCall(call: ToolCall) {
  return isRecord(call) && call["isCustomTool"] === true;
}
function isFreeformModelToolCall(call: ToolCall, parameters: ReadonlyMap<string, string>) {
  return parameters.has(call.name) && (isCustomToolCall(call) || isRawFreeformInput(call.args));
}
function markCustomToolOutput(message: ToolMessage) {
  const { artifact } = message;
  return new ToolMessage({
    additional_kwargs: { ...message.additional_kwargs, customTool: true },
    artifact,
    content: message.content,
    id: message.id,
    metadata: message.metadata,
    name: message.name,
    response_metadata: message.response_metadata,
    status: message.status,
    tool_call_id: message.tool_call_id,
  });
}
function isRawFreeformInput(args: unknown) {
  return isRecord(args) && Object.keys(args).length === 1 && typeof args["input"] === "string";
}
function singleToolOutput(value: unknown, callId: string) {
  if (!isRecord(value) || !Array.isArray(value["messages"])) {
    throw new Error("工具节点没有返回 messages");
  }
  const { messages } = value;
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
