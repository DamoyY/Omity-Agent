import {
  AIMessage,
  ToolMessage,
  mapChatMessagesToStoredMessages,
  mapStoredMessagesToChatMessages,
  type BaseMessage,
  type StoredMessage,
  type ToolCall,
} from "@langchain/core/messages";
import type { HookWhen } from "../types";

export interface AgentHookPlan {
  kind: "agent";
  when: HookWhen;
  sources: string[];
  sourceIndex: number;
  hookIndex: number;
  previousInvocationKey?: string;
}

export interface ToolHookPlan {
  kind: "tools";
  original: StoredMessage;
  toolIndex: number;
  stage: "before" | "original" | "after";
  hookIndex: number;
  previousInvocationKey?: string;
  contentEmitted: boolean;
  replaceMessageId?: string;
  awaiting?: { callId: string; invocationKey: string };
}

export type HookPlan =
  AgentHookPlan | ToolHookPlan | { kind: "done"; finalMessageId: string };

export interface HookState {
  messages: BaseMessage[];
  hookPendingUserIds: string[];
  hookPlan: HookPlan | null;
  hookPreviousInvocationKey?: string;
}

export function agentPlan(
  when: HookWhen,
  sources: string[],
  previousInvocationKey?: string,
): AgentHookPlan {
  return {
    kind: "agent",
    when,
    sources,
    sourceIndex: 0,
    hookIndex: 0,
    previousInvocationKey,
  };
}

export function toolPlan(message: AIMessage): ToolHookPlan {
  if (!message.id) throw new Error("模型工具调用消息缺少 ID");
  return {
    kind: "tools",
    original: storeMessage(message),
    toolIndex: 0,
    stage: "before",
    hookIndex: 0,
    contentEmitted: false,
    replaceMessageId: message.id,
  };
}

export function restoreOriginal(stored: StoredMessage) {
  const [message] = mapStoredMessagesToChatMessages([stored]);
  if (!AIMessage.isInstance(message)) throw new Error("Hook 工具计划无效");
  return message;
}

export function finishAwaited(
  plan: ToolHookPlan,
  messages: BaseMessage[],
): ToolHookPlan {
  if (!plan.awaiting || !isCompleted(messages, plan.awaiting.callId))
    return plan;
  return {
    ...plan,
    stage: "after",
    hookIndex: 0,
    awaiting: undefined,
    previousInvocationKey: plan.awaiting.invocationKey,
  };
}

export function nextToolStage(plan: ToolHookPlan): ToolHookPlan {
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

export function requireCallId(call: ToolCall) {
  if (!call.id) throw new Error(`工具调用缺少 ID：${call.name}`);
  return call.id;
}

function isCompleted(messages: BaseMessage[], id: string) {
  return messages.some(
    (message) => ToolMessage.isInstance(message) && message.tool_call_id === id,
  );
}

function storeMessage(message: BaseMessage) {
  const [stored] = mapChatMessagesToStoredMessages([message]);
  if (!stored) throw new Error("无法序列化 Hook 原始工具调用消息");
  return stored;
}
