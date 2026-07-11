import { AIMessage, type ToolCall } from "@langchain/core/messages";
import type { HookRule } from "../types";
import {
  finishAwaited,
  nextStage,
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
    const rule = hooks.matching("agent", "before")[plan.hookIndex];
    if (!rule) {
      plan = { ...plan, sourceIndex: plan.sourceIndex + 1, hookIndex: 0 };
      continue;
    }
    const result = await runHookStep(
      plan,
      rule,
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
    if (plan.stage === "original") {
      return emitOriginal(plan, original, call, hooks, threadId);
    }
    const rule = hooks.matching(call.name, plan.stage)[plan.hookIndex];
    if (!rule) {
      plan = nextStage(plan);
      continue;
    }
    const result = await runHookStep(
      plan,
      rule,
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
  sourceId: string,
  hooks: HookRuntime,
  threadId: string,
  signal?: AbortSignal,
) {
  if (!hooks.shouldRun(rule, sourceId, threadId)) return null;
  if (rule.mode === "silent") {
    await hooks.runSilent(
      rule,
      sourceId,
      threadId,
      signal,
      plan.previousInvocationKey,
    );
    plan.previousInvocationKey = hooks.identity.hook(rule, sourceId, threadId);
    return null;
  }
  const call = await hooks.resolvedCall(
    rule,
    sourceId,
    threadId,
    plan.previousInvocationKey,
  );
  return emit(plan, call, {
    kind: "hook",
    callId: requireCallId(call),
    invocationKey: hooks.identity.hook(rule, sourceId, threadId),
  });
}

function emitOriginal(
  plan: Extract<HookPlan, { kind: "tools" }>,
  original: AIMessage,
  call: ToolCall,
  hooks: HookRuntime,
  threadId: string,
) {
  const content = plan.contentEmitted ? "" : original.content;
  return emit(
    { ...plan, contentEmitted: true },
    call,
    {
      kind: "original",
      callId: requireCallId(call),
      invocationKey: hooks.identity.agentTool(
        call.name,
        requireCallId(call),
        threadId,
      ),
    },
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
