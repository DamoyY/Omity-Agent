import { HumanMessage } from "@langchain/core/messages";
import { queueMessageId } from "../infrastructure/database/records/messages/history";
import type { HostContext } from "./context";
import type { QueueRun } from "./run";
export function consumeBoundaryAppends(ctx: HostContext, run: QueueRun, state: BoundaryState) {
  if (hasPendingTools(state) || blocksAppend(state.values?.hookPlan)) return null;
  const appends = ctx.db.pendingAppends(ctx.sessionId);
  if (appends.length === 0) return null;
  for (const item of appends) {
    const userMessageId = ctx.db.startQueue(ctx.sessionId, item);
    run.items.push({ ...item, status: "running", userMessageId });
  }
  ctx.logger.info("已在节点边界追加输入", {
    queueIds: appends.map((item) => item.id),
  });
  return {
    messages: appends.map(
      (item) =>
        new HumanMessage({
          content: item.content,
          id: queueMessageId(ctx.sessionId, item.id),
        }),
    ),
    hookPendingUserIds: [
      ...pendingUserIds(state),
      ...appends.map((item) => queueMessageId(ctx.sessionId, item.id)),
    ],
  };
}
export function recoverConsumedAppends(ctx: HostContext, run: QueueRun, state: BoundaryState) {
  const consumedIds = new Set(run.items.map((item) => queueMessageId(ctx.sessionId, item.id)));
  for (const message of state.values?.messages ?? []) {
    if (HumanMessage.isInstance(message) && message.id) {
      consumedIds.delete(message.id);
    }
  }
  if (consumedIds.size === 0) return null;
  const messages = ctx.db
    .history(ctx.sessionId)
    .filter(
      (message) =>
        HumanMessage.isInstance(message) && message.id !== undefined && consumedIds.has(message.id),
    );
  const recoveredIds = new Set(messages.map((message) => message.id));
  const absentIds = [...consumedIds].filter((id) => !recoveredIds.has(id));
  if (absentIds.length > 0) {
    throw new Error(`已消费的用户消息不存在：${absentIds.join(", ")}`);
  }
  ctx.logger.warn("恢复 checkpoint 后尚未提交的追加输入", {
    queueIds: run.items
      .filter((item) => consumedIds.has(queueMessageId(ctx.sessionId, item.id)))
      .map((item) => item.id),
  });
  return {
    messages,
    hookPendingUserIds: [...new Set([...pendingUserIds(state), ...consumedIds])],
  };
}
interface BoundaryState {
  values?: {
    messages?: unknown[];
    hookPlan?: unknown;
    hookPendingUserIds?: unknown;
  };
}
function blocksAppend(plan: unknown) {
  return (
    plan !== null &&
    plan !== undefined &&
    (!isRecord(plan) || plan["kind"] !== "agent" || plan["when"] !== "after")
  );
}
function pendingUserIds(state: BoundaryState) {
  const value = state.values?.hookPendingUserIds;
  return Array.isArray(value) && value.every((id) => typeof id === "string") ? value : [];
}
function hasPendingTools(state: BoundaryState) {
  const messages = state.values?.messages;
  if (!Array.isArray(messages)) return false;
  const toolIds = new Set(messages.filter(isToolMessage).map((message) => message.tool_call_id));
  const lastAi = messages.findLast(isAiMessage);
  return Boolean(lastAi?.tool_calls?.some((call) => !toolIds.has(call.id)));
}
function isToolMessage(message: unknown): message is { type: "tool"; tool_call_id: string } {
  return (
    isRecord(message) && message["type"] === "tool" && typeof message["tool_call_id"] === "string"
  );
}
function isAiMessage(message: unknown): message is { type: "ai"; tool_calls?: { id: string }[] } {
  return isRecord(message) && message["type"] === "ai";
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
