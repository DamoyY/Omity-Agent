import {
  AIMessage,
  type BaseMessage,
  type StoredMessage,
  type ToolCall,
  ToolMessage,
  mapChatMessagesToStoredMessages,
  mapStoredMessagesToChatMessages,
} from "@langchain/core/messages";
import { type HookToolOutput, readToolOutput } from "./storage/outputs";
import type { HookWhen } from "../types";
export interface AgentHookPlan {
  kind: "agent";
  when: HookWhen;
  sources: string[];
  sourceIndex: number;
  hookIndex: number;
  previousOutput?: HookToolOutput;
}
export interface ToolHookPlan {
  kind: "tools";
  original: StoredMessage;
  toolIndex: number;
  stage: "before" | "original" | "after";
  hookIndex: number;
  previousOutput?: HookToolOutput;
  responseEmitted: boolean;
  replaceMessageId?: string;
  awaiting?: { callId: string };
}
export type HookPlan = AgentHookPlan | ToolHookPlan | { kind: "done"; finalMessageId: string };
export interface HookState {
  messages: BaseMessage[];
  hookPendingUserIds: string[];
  hookPlan: HookPlan | null;
  hookPreviousOutput?: HookToolOutput;
}
export function agentPlan(
  when: HookWhen,
  sources: string[],
  previousOutput?: HookToolOutput,
): AgentHookPlan {
  return {
    hookIndex: 0,
    kind: "agent",
    previousOutput,
    sourceIndex: 0,
    sources,
    when,
  };
}
export function toolPlan(message: AIMessage): ToolHookPlan {
  if (!message.id) {
    throw new Error("工具调用消息缺少 ID");
  }
  return {
    hookIndex: 0,
    kind: "tools",
    original: storeMessage(message),
    replaceMessageId: message.id,
    responseEmitted: false,
    stage: "before",
    toolIndex: 0,
  };
}
export function restoreOriginal(stored: StoredMessage) {
  const [message] = mapStoredMessagesToChatMessages([stored]);
  if (!AIMessage.isInstance(message)) {
    throw new Error("Hook 工具计划无效");
  }
  return message;
}
export function finishAwaited(plan: ToolHookPlan, messages: BaseMessage[]): ToolHookPlan {
  if (!plan.awaiting) {
    return plan;
  }
  const output = completedOutput(messages, plan.awaiting.callId);
  if (!output) {
    return plan;
  }
  return {
    ...plan,
    awaiting: undefined,
    hookIndex: 0,
    previousOutput: readToolOutput(output),
    stage: "after",
  };
}
export function nextToolStage(plan: ToolHookPlan): ToolHookPlan {
  if (plan.stage === "before") {
    return { ...plan, hookIndex: 0, stage: "original" };
  }
  return {
    ...plan,
    hookIndex: 0,
    stage: "before",
    toolIndex: plan.toolIndex + 1,
  };
}
export function requireCallId(call: ToolCall) {
  if (!call.id) {
    throw new Error(`工具调用缺少 ID：${call.name}`);
  }
  return call.id;
}
function completedOutput(messages: BaseMessage[], id: string) {
  return messages.findLast(
    (message) => ToolMessage.isInstance(message) && message.tool_call_id === id,
  ) as ToolMessage | undefined;
}
function storeMessage(message: BaseMessage) {
  const [stored] = mapChatMessagesToStoredMessages([message]);
  if (!stored) {
    throw new Error("无法序列化 Hook 原始工具调用消息");
  }
  return stored;
}
