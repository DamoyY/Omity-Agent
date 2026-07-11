import { HumanMessage } from "@langchain/core/messages";
import { Command } from "@langchain/langgraph";
import { queueMessageId } from "../infrastructure/messages";
import type { HostContext } from "./context";
import type { QueueRun } from "./run";

export function consumeBoundaryAppends(
  ctx: HostContext,
  run: QueueRun,
  state: BoundaryState,
) {
  if (hasPendingTools(state) || state.values?.hookPlan) return null;
  const appends = ctx.db.pendingAppends(ctx.sessionId);
  if (appends.length === 0) return null;
  for (const item of appends) {
    const userMessageId = ctx.db.startQueue(ctx.sessionId, item);
    run.items.push({ ...item, status: "running", userMessageId });
  }
  ctx.logger.info("已在节点边界追加输入", {
    queueIds: appends.map((item) => item.id),
  });
  return new Command({
    update: {
      messages: appends.map(
        (item) =>
          new HumanMessage({
            content: item.content,
            id: queueMessageId(ctx.sessionId, item.id),
          }),
      ),
      hookPendingUserIds: appends.map((item) =>
        queueMessageId(ctx.sessionId, item.id),
      ),
    },
    goto: ctx.beforeModelNode,
  });
}

interface BoundaryState {
  values?: { messages?: unknown[]; hookPlan?: unknown };
}

function hasPendingTools(state: BoundaryState) {
  const messages = state.values?.messages;
  if (!Array.isArray(messages)) return false;
  const toolIds = new Set(
    messages.filter(isToolMessage).map((message) => message.tool_call_id),
  );
  const lastAi = messages.findLast(isAiMessage);
  return Boolean(lastAi?.tool_calls?.some((call) => !toolIds.has(call.id)));
}

function isToolMessage(
  message: unknown,
): message is { type: "tool"; tool_call_id: string } {
  return (
    isRecord(message) &&
    message["type"] === "tool" &&
    typeof message["tool_call_id"] === "string"
  );
}

function isAiMessage(
  message: unknown,
): message is { type: "ai"; tool_calls?: { id: string }[] } {
  return isRecord(message) && message["type"] === "ai";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
