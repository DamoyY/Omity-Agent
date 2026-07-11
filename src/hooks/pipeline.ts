import { AIMessage, type ToolCall } from "@langchain/core/messages";
import type { HookRule } from "../types";
import {
  isCompleted,
  requireCallId,
  restoreOriginal,
  type Awaiting,
  type HookPlan,
  type HookState,
} from "./plan";
import type { HookRuntime } from "./runtime";

export async function advancePlan(
  state: HookState,
  hooks: HookRuntime,
  threadId: string,
  signal?: AbortSignal,
) {
  let plan = state.hookPlan;
  if (!plan) throw new Error("Hook 计划缺失");
  plan = finishAwaited(plan, state);
  while (plan.kind === "user") {
    const sourceId = plan.sources[plan.sourceIndex];
    if (!sourceId) return { hookPlan: null };
    const rule = hooks.matching("user_message")[plan.hookIndex];
    if (!rule) {
      plan = { ...plan, sourceIndex: plan.sourceIndex + 1, hookIndex: 0 };
      continue;
    }
    const result = await runHookStep(
      plan,
      rule,
      "user_message",
      sourceId,
      hooks,
      threadId,
      signal,
    );
    if (result) return result;
    plan = { ...plan, hookIndex: plan.hookIndex + 1 };
  }
  return advanceTools(plan, hooks, threadId, signal);
}

async function advanceTools(
  initial: Extract<HookPlan, { kind: "tools" }>,
  hooks: HookRuntime,
  threadId: string,
  signal?: AbortSignal,
) {
  let plan = initial;
  const original = restoreOriginal(plan.original);
  while (true) {
    const call = original.tool_calls?.[plan.toolIndex];
    if (!call) return { hookPlan: null };
    if (plan.stage === "original") return emitOriginal(plan, original, call);
    const trigger = plan.stage === "before" ? "tool_before" : "tool_after";
    const rule = hooks.matching(trigger, call.name)[plan.hookIndex];
    if (!rule) {
      plan = nextStage(plan);
      continue;
    }
    const result = await runHookStep(
      plan,
      rule,
      trigger,
      requireCallId(call),
      hooks,
      threadId,
      signal,
    );
    if (result) return result;
    plan = { ...plan, hookIndex: plan.hookIndex + 1 };
  }
}

async function runHookStep(
  plan: HookPlan,
  rule: HookRule,
  trigger: HookRule["on"],
  sourceId: string,
  hooks: HookRuntime,
  threadId: string,
  signal?: AbortSignal,
) {
  if (rule.mode === "silent") {
    await hooks.runSilent(rule, trigger, sourceId, threadId, signal);
    return null;
  }
  const call = await hooks.resolvedCall(rule, trigger, sourceId, threadId);
  return emit(plan, call, { kind: "hook", callId: requireCallId(call) });
}

function emitOriginal(
  plan: Extract<HookPlan, { kind: "tools" }>,
  original: AIMessage,
  call: ToolCall,
) {
  const content = plan.contentEmitted ? "" : original.content;
  return emit(
    { ...plan, contentEmitted: true },
    call,
    { kind: "original", callId: requireCallId(call) },
    content,
    original,
  );
}

function emit(
  plan: HookPlan,
  call: ToolCall,
  awaiting: Awaiting,
  content: AIMessage["content"] = "",
  original?: AIMessage,
) {
  const id = plan.kind === "tools" ? plan.replaceMessageId : undefined;
  const hookPlan =
    plan.kind === "tools"
      ? { ...plan, replaceMessageId: undefined, awaiting }
      : { ...plan, awaiting };
  return {
    messages: [
      new AIMessage({
        id,
        content,
        tool_calls: [call],
        additional_kwargs: original?.additional_kwargs,
        response_metadata: original?.response_metadata,
        usage_metadata: original?.usage_metadata,
      }),
    ],
    hookPlan,
    jumpTo: "tools" as const,
  };
}

function finishAwaited(plan: HookPlan, state: HookState): HookPlan {
  if (!plan.awaiting || !isCompleted(state.messages, plan.awaiting.callId)) {
    return plan;
  }
  if (plan.kind === "user") {
    return { ...plan, awaiting: undefined, hookIndex: plan.hookIndex + 1 };
  }
  if (plan.awaiting.kind === "original") {
    return { ...plan, awaiting: undefined, stage: "after", hookIndex: 0 };
  }
  return { ...plan, awaiting: undefined, hookIndex: plan.hookIndex + 1 };
}

function nextStage(
  plan: Extract<HookPlan, { kind: "tools" }>,
): Extract<HookPlan, { kind: "tools" }> {
  if (plan.stage === "before") {
    return { ...plan, stage: "original", hookIndex: 0 };
  }
  return {
    ...plan,
    toolIndex: plan.toolIndex + 1,
    stage: "before",
    hookIndex: 0,
  };
}
