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
            id: plan.kind === "tools" ? plan.replaceMessageId : undefined,
            content: "",
            tool_calls: [result.call],
          }),
          result.output,
        ]
      : undefined;
  return new Command({
    update: {
      hookPlan: nextPlan,
      hookPreviousOutput: result.value,
      ...(clearPending ? { hookPendingUserIds: [] } : {}),
      ...(messages ? { messages } : {}),
    },
    goto: hookNode,
  });
}

export function originalToolCommand(plan: ToolHookPlan, original: AIMessage, call: ToolCall) {
  if (!call.id) throw new Error(`工具调用缺少 ID：${call.name}`);
  const includeResponse = !plan.responseEmitted;
  return new Command({
    update: {
      messages: [
        new AIMessage({
          id: plan.replaceMessageId,
          tool_calls: [call],
          ...partitionToolResponse(original, call.id, includeResponse),
        }),
      ],
      hookPlan: {
        ...plan,
        replaceMessageId: undefined,
        responseEmitted: true,
        awaiting: {
          callId: call.id,
        },
      },
    },
    goto: toolsNode,
  });
}

export function finishAgent(plan: AgentHookPlan, clearPending: boolean) {
  if (plan.when === "before") {
    return command(null, modelNode, clearPending, plan.previousOutput);
  }
  const finalMessageId = plan.sources.at(-1);
  if (!finalMessageId) throw new Error("Agent after Hook 缺少最终消息 ID");
  return command({ kind: "done", finalMessageId }, END, clearPending, plan.previousOutput);
}

export function command(
  plan: HookPlan | null,
  goto: string,
  clearPending: boolean,
  previousOutput?: unknown,
) {
  return new Command({
    update: {
      hookPlan: plan,
      hookPreviousOutput: previousOutput,
      ...(clearPending ? { hookPendingUserIds: [] } : {}),
    },
    goto,
  });
}
