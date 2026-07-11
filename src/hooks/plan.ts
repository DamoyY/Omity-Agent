import {
  AIMessage,
  ToolMessage,
  mapChatMessagesToStoredMessages,
  mapStoredMessagesToChatMessages,
  type BaseMessage,
  type StoredMessage,
  type ToolCall,
} from "@langchain/core/messages";

export type Awaiting = { kind: "hook" | "original"; callId: string };

export type HookPlan =
  | {
      kind: "user";
      sources: string[];
      sourceIndex: number;
      hookIndex: number;
      awaiting?: Awaiting;
    }
  | {
      kind: "tools";
      original: StoredMessage;
      toolIndex: number;
      stage: "before" | "original" | "after";
      hookIndex: number;
      contentEmitted: boolean;
      replaceMessageId?: string;
      awaiting?: Awaiting;
    };

export type HookState = {
  messages: BaseMessage[];
  hookPendingUserIds: string[];
  hookPlan: HookPlan | null;
};

export function userPlan(sources: string[]): HookPlan {
  return { kind: "user", sources, sourceIndex: 0, hookIndex: 0 };
}

export function toolPlan(message: AIMessage): HookPlan {
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
  if (!(message instanceof AIMessage)) throw new Error("Hook 工具计划无效");
  return message;
}

export function isCompleted(messages: BaseMessage[], id: string) {
  return messages.some(
    (message) => ToolMessage.isInstance(message) && message.tool_call_id === id,
  );
}

export function requireCallId(call: ToolCall) {
  if (!call.id) throw new Error(`工具调用缺少 ID：${call.name}`);
  return call.id;
}

function storeMessage(message: BaseMessage) {
  const [stored] = mapChatMessagesToStoredMessages([message]);
  if (!stored) throw new Error("无法序列化 Hook 原始工具调用消息");
  return stored;
}
