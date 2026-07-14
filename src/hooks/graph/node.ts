import {
  type AgentHookPlan,
  type HookPlan,
  type HookState,
  type ToolHookPlan,
  agentPlan,
  finishAwaited,
  nextToolStage,
  requireCallId,
  restoreOriginal,
} from "../plan";
import { END, type LangGraphRunnableConfig } from "@langchain/langgraph";
import type { ToolCall, ToolMessage } from "@langchain/core/messages";
import { command, finishAgent, hookCommand, modelNode, originalToolCommand } from "./commands";
import type { HookRule } from "../../types";
import type { HookRuntime } from "../runtime";
type ConsumeHook = (hookId: string, limit: number) => Promise<boolean>;
type InvokeGraphTool = (call: ToolCall) => Promise<ToolMessage>;
export function createHookNode(
  hooks: HookRuntime,
  consumeHook: ConsumeHook,
  invokeTool: InvokeGraphTool,
) {
  return async (state: HookState, config: LangGraphRunnableConfig) => {
    const threadId = requireThreadId(config.configurable);
    let plan = initialPlan(state);
    let clearPending = !state.hookPlan && state.hookPendingUserIds.length > 0;
    if (plan?.kind === "agent" && plan.when === "after" && state.hookPendingUserIds.length > 0) {
      plan = agentPlan("before", state.hookPendingUserIds, plan.previousOutput);
      clearPending = true;
    }
    if (!plan) {
      return command(null, modelNode, clearPending);
    }
    if (plan.kind === "done") {
      return command(plan, END, clearPending);
    }
    if (plan.kind === "tools") {
      plan = finishAwaited(plan, state.messages);
    }
    for (;;) {
      if (plan.kind === "agent") {
        const sourceId = plan.sources[plan.sourceIndex];
        if (!sourceId) {
          return finishAgent(plan, clearPending);
        }
        const rule = hooks.matching("agent", plan.when)[plan.hookIndex];
        if (!rule) {
          plan = { ...plan, hookIndex: 0, sourceIndex: plan.sourceIndex + 1 };
          continue;
        }
        const result = await executeHook(
          plan,
          rule,
          sourceId,
          hooks,
          threadId,
          consumeHook,
          invokeTool,
        );
        plan = { ...plan, hookIndex: plan.hookIndex + 1 };
        if (!result) {
          continue;
        }
        return hookCommand(plan, rule, result, clearPending);
      }
      const original = restoreOriginal(plan.original);
      const call = original.tool_calls?.[plan.toolIndex];
      if (!call) {
        return command(null, modelNode, clearPending, plan.previousOutput);
      }
      if (plan.stage === "original") {
        return originalToolCommand(plan, original, call);
      }
      const rule = hooks.matching(call.name, plan.stage)[plan.hookIndex];
      if (!rule) {
        plan = nextToolStage(plan);
        continue;
      }
      const result = await executeHook(
        plan,
        rule,
        requireCallId(call),
        hooks,
        threadId,
        consumeHook,
        invokeTool,
      );
      plan = { ...plan, hookIndex: plan.hookIndex + 1 };
      if (!result) {
        continue;
      }
      return hookCommand(plan, rule, result, clearPending);
    }
  };
}
function initialPlan(state: HookState): HookPlan | null {
  if (state.hookPlan) {
    return state.hookPlan;
  }
  return state.hookPendingUserIds.length > 0 ? agentPlan("before", state.hookPendingUserIds) : null;
}
function executeHook(
  plan: AgentHookPlan | ToolHookPlan,
  rule: HookRule,
  sourceId: string,
  hooks: HookRuntime,
  threadId: string,
  consumeHook: ConsumeHook,
  invokeTool: InvokeGraphTool,
) {
  return hooks.run(rule, sourceId, threadId, {
    consume: consumeHook,
    invoke: invokeTool,
    previousOutput: plan.previousOutput,
  });
}
export function requireThreadId(configurable: Record<string, unknown> | undefined) {
  const threadId = configurable?.["thread_id"];
  if (typeof threadId !== "string" || !threadId) {
    throw new Error("Hook 执行缺少 thread_id");
  }
  return threadId;
}
export { hookNode } from "./commands";
