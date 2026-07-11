import { AIMessage, type ToolCall } from "@langchain/core/messages";
import { Command, END } from "@langchain/langgraph";
import type { HookRule } from "../../types";
import type { AgentHookPlan, HookPlan, ToolHookPlan } from "../plan";
import type { HookRuntime } from "../runtime";

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
    previousInvocationKey: result.invocationKey,
  };
  const nextPlan =
    rule.mode === "takeover" &&
    advancedPlan.kind === "tools" &&
    advancedPlan.replaceMessageId
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
      hookPreviousInvocationKey: result.invocationKey,
      ...(clearPending ? { hookPendingUserIds: [] } : {}),
      ...(messages ? { messages } : {}),
    },
    goto: hookNode,
  });
}

export function originalToolCommand(
  plan: ToolHookPlan,
  original: AIMessage,
  call: ToolCall,
  hooks: HookRuntime,
  threadId: string,
) {
  if (!call.id) throw new Error(`工具调用缺少 ID：${call.name}`);
  return new Command({
    update: {
      messages: [
        new AIMessage({
          id: plan.replaceMessageId,
          content: plan.contentEmitted ? "" : original.content,
          tool_calls: [call],
          additional_kwargs: original.additional_kwargs,
          response_metadata: original.response_metadata,
          usage_metadata: original.usage_metadata,
        }),
      ],
      hookPlan: {
        ...plan,
        replaceMessageId: undefined,
        contentEmitted: true,
        awaiting: {
          callId: call.id,
          invocationKey: hooks.agentToolKey(call.name, call.id, threadId),
        },
      },
    },
    goto: toolsNode,
  });
}

export function finishAgent(plan: AgentHookPlan, clearPending: boolean) {
  if (plan.when === "before") {
    return command(null, modelNode, clearPending, plan.previousInvocationKey);
  }
  const finalMessageId = plan.sources.at(-1);
  if (!finalMessageId) throw new Error("Agent after Hook 缺少最终消息 ID");
  return command(
    { kind: "done", finalMessageId },
    END,
    clearPending,
    plan.previousInvocationKey,
  );
}

export function command(
  plan: HookPlan | null,
  goto: string,
  clearPending: boolean,
  previousInvocationKey?: string,
) {
  return new Command({
    update: {
      hookPlan: plan,
      hookPreviousInvocationKey: previousInvocationKey,
      ...(clearPending ? { hookPendingUserIds: [] } : {}),
    },
    goto,
  });
}
