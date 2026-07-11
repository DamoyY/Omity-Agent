import { AIMessage } from "@langchain/core/messages";
import { createMiddleware } from "langchain";
import { z } from "zod";
import { requireCallId, toolPlan, userPlan, type HookState } from "./plan";
import { advancePlan } from "./pipeline";
import { HookRuntime } from "./runtime";
import { isHookCallId } from "./storage/calls";

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
      hook: async (rawState, runtime) => {
        const state = rawState as HookState;
        const threadId = requireThreadId(runtime.configurable);
        if (state.hookPlan) {
          return advancePlan(state, hooks, threadId, runtime.signal);
        }
        if (state.hookPendingUserIds.length === 0) return;
        return advancePlan(
          {
            ...state,
            hookPendingUserIds: [],
            hookPlan: userPlan(state.hookPendingUserIds),
          },
          hooks,
          threadId,
          runtime.signal,
        ).then((result) => ({
          ...result,
          hookPendingUserIds: [],
        }));
      },
    },
    afterModel: {
      canJumpTo: ["tools"],
      hook: async (rawState, runtime) => {
        const state = rawState as HookState;
        const original = state.messages.at(-1);
        if (!AIMessage.isInstance(original) || !original.tool_calls?.length) {
          return;
        }
        const planned = { ...state, hookPlan: toolPlan(original) };
        return advancePlan(
          planned,
          hooks,
          requireThreadId(runtime.configurable),
          runtime.signal,
        );
      },
    },
    wrapToolCall: async (request, handler) => {
      const callId = request.toolCall.id;
      const threadId = requireThreadId(request.runtime.configurable);
      if (isHookCallId(callId)) {
        return hooks.runTakeover(callId, threadId, () =>
          Promise.resolve(handler(request)),
        );
      }
      return hooks.runAgentTool(
        request.toolCall.name,
        requireCallId(request.toolCall),
        threadId,
        () => Promise.resolve(handler(request)),
      );
    },
  });
}

function requireThreadId(configurable: Record<string, unknown> | undefined) {
  const threadId = configurable?.["thread_id"];
  if (typeof threadId !== "string" || !threadId) {
    throw new Error("Hook 执行缺少 thread_id");
  }
  return threadId;
}
