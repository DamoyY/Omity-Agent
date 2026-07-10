import {
  AIMessage,
  ToolMessage,
  mapChatMessagesToStoredMessages,
  mapStoredMessagesToChatMessages,
  type BaseMessage,
  type StoredMessage,
  type ToolCall,
} from "@langchain/core/messages";
import type { HookRule } from "../types";
import type { HookRuntime } from "./runtime";

export type HookPlan =
  | { phase: "user"; hookCallIds: string[] }
  | {
      phase: "before";
      hookCallIds: string[];
      original: StoredMessage;
      afterCalls: ToolCall[];
    }
  | { phase: "original"; originalCallIds: string[]; afterCalls: ToolCall[] }
  | { phase: "after"; hookCallIds: string[] };

export type HookState = {
  messages: BaseMessage[];
  hookPendingUserIds: string[];
  hookPlan: HookPlan | null;
};

export function advancePlan(state: HookState) {
  const plan = state.hookPlan;
  if (!plan) return null;
  if (plan.phase === "user") {
    return callsCompleted(state.messages, plan.hookCallIds)
      ? { hookPlan: null }
      : null;
  }
  if (plan.phase === "before") {
    if (!callsCompleted(state.messages, plan.hookCallIds)) return null;
    const original = restoreOriginal(plan.original);
    return {
      messages: [original],
      hookPlan: {
        phase: "original",
        originalCallIds: callIds(original.tool_calls ?? []),
        afterCalls: plan.afterCalls,
      } satisfies HookPlan,
      jumpTo: "tools" as const,
    };
  }
  if (plan.phase === "original") {
    if (!callsCompleted(state.messages, plan.originalCallIds)) return null;
    if (plan.afterCalls.length === 0) return { hookPlan: null };
    return {
      messages: [new AIMessage({ content: "", tool_calls: plan.afterCalls })],
      hookPlan: {
        phase: "after",
        hookCallIds: callIds(plan.afterCalls),
      } satisfies HookPlan,
      jumpTo: "tools" as const,
    };
  }
  return callsCompleted(state.messages, plan.hookCallIds)
    ? { hookPlan: null }
    : null;
}

export function takeoverCalls(
  hooks: HookRuntime,
  trigger: "tool_before" | "tool_after",
  originalCalls: ToolCall[],
) {
  return originalCalls.flatMap((call) => {
    const sourceId = requireCallId(call);
    return hooks
      .matching(trigger, call.name, "takeover")
      .map((rule: HookRule) => hooks.createCall(rule, trigger, sourceId));
  });
}

export function storedMessage(message: BaseMessage) {
  const [stored] = mapChatMessagesToStoredMessages([message]);
  if (!stored) throw new Error("无法序列化 Hook 原始工具调用消息");
  return stored;
}

export function callIds(calls: ToolCall[]) {
  return calls.map(requireCallId);
}

function restoreOriginal(stored: StoredMessage) {
  const [message] = mapStoredMessagesToChatMessages([stored]);
  if (!(message instanceof AIMessage))
    throw new Error("Hook 原始工具调用消息无效");
  return new AIMessage({
    id: `${message.id}:after-hooks`,
    content: message.content,
    tool_calls: message.tool_calls,
    invalid_tool_calls: message.invalid_tool_calls,
    additional_kwargs: message.additional_kwargs,
    response_metadata: message.response_metadata,
    usage_metadata: message.usage_metadata,
  });
}

function callsCompleted(messages: BaseMessage[], ids: string[]) {
  const completed = new Set(
    messages
      .filter(ToolMessage.isInstance)
      .map((message) => message.tool_call_id),
  );
  return ids.every((id) => completed.has(id));
}

function requireCallId(call: ToolCall) {
  if (!call.id) throw new Error(`工具调用缺少 ID：${call.name}`);
  return call.id;
}
