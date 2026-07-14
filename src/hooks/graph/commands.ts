import { AIMessage, type ToolCall } from "@langchain/core/messages";
import { Command, END } from "@langchain/langgraph";
import type { HookRule } from "../../types";
import type { AgentHookPlan, HookPlan, ToolHookPlan } from "../plan";
import type { HookRuntime } from "../runtime";
import { partitionToolResponse } from "./responsePartition";
export const hookNode = "hooks";
export const modelNode = "model_request";
export const toolsNode = "tools";
type HookExecution = NonNullable<Awaited<ReturnType<HookRuntime["run"]>>>;
export function hookCommand(
  plan: AgentHookPlan | ToolHookPlan,
  rule: HookRule,
  result: HookExecution,
  clearPending: boolean,
) {
  const advancedPlan = {
    ...plan,
    previousOutput: result.value,
  };
  const nextPlan =
    rule.mode === "takeover" && advancedPlan.kind === "tools" && advancedPlan.replaceMessageId
      ? { ...advancedPlan, replaceMessageId: undefined }
      : advancedPlan;
  const messages =
    rule.mode === "takeover"
      ? [
          new AIMessage({
            content: "",
            id: plan.kind === "tools" ? plan.replaceMessageId : undefined,
            tool_calls: [result.call],
          }),
          result.output,
        ]
      : undefined;
  return new Command({
    goto: hookNode,
    update: {
      hookPlan: nextPlan,
      hookPreviousOutput: result.value,
      ...(clearPending ? { hookPendingUserIds: [] } : {}),
      ...(messages ? { messages } : {}),
    },
  });
}
export function originalToolCommand(plan: ToolHookPlan, original: AIMessage, call: ToolCall) {
  if (!call.id) {
    throw new Error(`工具调用缺少 ID：${call.name}`);
  }
  const includeResponse = !plan.responseEmitted;
  return new Command({
    goto: toolsNode,
    update: {
      hookPlan: {
        ...plan,
        awaiting: {
          callId: call.id,
        },
        replaceMessageId: undefined,
        responseEmitted: true,
      },
      messages: [
        new AIMessage({
          id: plan.replaceMessageId,
          tool_calls: [call],
          ...partitionToolResponse(original, call.id, includeResponse),
        }),
      ],
    },
  });
}
export function finishAgent(plan: AgentHookPlan, clearPending: boolean) {
  if (plan.when === "before") {
    return command(null, modelNode, clearPending, plan.previousOutput);
  }
  const finalMessageId = plan.sources.at(-1);
  if (!finalMessageId) {
    throw new Error("Agent after Hook 缺少最终消息 ID");
  }
  return command({ finalMessageId, kind: "done" }, END, clearPending, plan.previousOutput);
}
export function command(
  plan: HookPlan | null,
  goto: string,
  clearPending: boolean,
  previousOutput?: unknown,
) {
  return new Command({
    goto,
    update: {
      hookPlan: plan,
      hookPreviousOutput: previousOutput,
      ...(clearPending ? { hookPendingUserIds: [] } : {}),
    },
  });
}
