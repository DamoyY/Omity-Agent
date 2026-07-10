import { AIMessage } from "@langchain/core/messages";
import { createMiddleware } from "langchain";
import { z } from "zod";
import { isHookCallId } from "./callId";
import {
  advancePlan,
  callIds,
  storedMessage,
  takeoverCalls,
  type HookPlan,
  type HookState,
} from "./plan";
import { HookRuntime } from "./runtime";

export const hookBeforeModelNode = "hooks.before_model";

export function createHookMiddleware(hooks: HookRuntime) {
  return createMiddleware({
    name: "hooks",
    stateSchema: z.object({
      hookPendingUserIds: z.array(z.string()).default([]),
      hookPlan: z.unknown().nullable().default(null),
    }),
    beforeModel: {
      canJumpTo: ["tools"],
      hook: async (rawState) => beforeModel(rawState as HookState, hooks),
    },
    afterModel: {
      canJumpTo: ["tools"],
      hook: async (rawState) => afterModel(rawState as HookState, hooks),
    },
    wrapToolCall: async (request, handler) => {
      const callId = request.toolCall.id;
      const threadId = requireThreadId(request.runtime.configurable);
      if (isHookCallId(callId)) {
        return hooks.runTakeover(callId, threadId, () =>
          Promise.resolve(handler(request)),
        );
      }
      if (!callId) throw new Error(`工具调用缺少 ID：${request.toolCall.name}`);
      await hooks.runSilent("tool_before", callId, threadId, {
        matchTool: request.toolCall.name,
        signal: request.runtime.signal,
      });
      const output = await hooks.runAgentTool(
        request.toolCall.name,
        callId,
        threadId,
        () => Promise.resolve(handler(request)),
      );
      await hooks.runSilent("tool_after", callId, threadId, {
        matchTool: request.toolCall.name,
        signal: request.runtime.signal,
      });
      return output;
    },
  });
}

async function beforeModel(state: HookState, hooks: HookRuntime) {
  const planResult = advancePlan(state);
  if (planResult) return planResult;
  if (state.hookPendingUserIds.length === 0) return;
  const calls = state.hookPendingUserIds.flatMap((sourceId) =>
    hooks
      .matching("user_message", undefined, "takeover")
      .map((rule) => hooks.createCall(rule, "user_message", sourceId)),
  );
  if (calls.length === 0) return { hookPendingUserIds: [] };
  return {
    messages: [new AIMessage({ content: "", tool_calls: calls })],
    hookPendingUserIds: [],
    hookPlan: {
      phase: "user",
      hookCallIds: callIds(calls),
    } satisfies HookPlan,
    jumpTo: "tools" as const,
  };
}

async function afterModel(state: HookState, hooks: HookRuntime) {
  const original = state.messages.at(-1);
  if (!(original instanceof AIMessage) || !original.tool_calls?.length) return;
  const beforeCalls = takeoverCalls(hooks, "tool_before", original.tool_calls);
  const afterCalls = takeoverCalls(hooks, "tool_after", original.tool_calls);
  if (beforeCalls.length === 0 && afterCalls.length === 0) return;
  if (beforeCalls.length === 0) {
    return {
      hookPlan: {
        phase: "original",
        originalCallIds: callIds(original.tool_calls),
        afterCalls,
      } satisfies HookPlan,
    };
  }
  if (!original.id) throw new Error("模型工具调用消息缺少 ID");
  return {
    messages: [
      new AIMessage({ id: original.id, content: "", tool_calls: beforeCalls }),
    ],
    hookPlan: {
      phase: "before",
      hookCallIds: callIds(beforeCalls),
      original: storedMessage(original),
      afterCalls,
    } satisfies HookPlan,
    jumpTo: "tools" as const,
  };
}

function requireThreadId(configurable: Record<string, unknown> | undefined) {
  const threadId = configurable?.["thread_id"];
  if (typeof threadId !== "string" || !threadId) {
    throw new Error("Hook 执行缺少 thread_id");
  }
  return threadId;
}
