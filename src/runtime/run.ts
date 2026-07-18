import type { BaseMessage } from "@langchain/core/messages";
import type { ErrorDetails } from "../failures/details";
import type { HostContext } from "./context";
import type { QueueItem } from "../types";
import { contentToText } from "./content";
import { deleteThreadData } from "../checkpointer/lifecycle";
import { runTransaction } from "../infrastructure/database/connection";

export class CanceledRunError extends Error {
  override readonly name = "CanceledRunError";
}
export interface QueueRun {
  items: [QueueItem, ...QueueItem[]];
  rootId: number;
  threadId: string;
}
export function finishRun(
  ctx: HostContext,
  run: QueueRun,
  messages: BaseMessage[],
  hookPlan: unknown,
) {
  const finalMessageId = requireFinalMessageId(hookPlan);
  const last = messages.find((message) => message.type === "ai" && message.id === finalMessageId);
  const content = contentToText(last?.content);
  if (!content) {
    throw new Error("模型没有生成可记录的最终文本");
  }
  const lastItem = run.items.at(-1);
  if (!lastItem) {
    throw new Error("运行没有可记录的队列项");
  }
  finalizeRun(ctx, run, "done");
  ctx.observer?.changed?.(ctx.sessionId);
  ctx.logger.info("队列完成", { chars: content.length, queueId: lastItem.id });
  if (ctx.settings.logging.streamTokens) {
    process.stdout.write("\n");
  }
}
function requireFinalMessageId(plan: unknown) {
  if (
    typeof plan !== "object" ||
    plan === null ||
    !("kind" in plan) ||
    plan.kind !== "done" ||
    !("finalMessageId" in plan) ||
    typeof plan.finalMessageId !== "string"
  ) {
    throw new Error("运行缺少最终消息边界");
  }
  return plan.finalMessageId;
}
export function cancelRun(ctx: HostContext, run: QueueRun) {
  finalizeRun(ctx, run, "canceled");
  ctx.controller.abort(new CanceledRunError("运行已取消"));
  ctx.observer?.changed?.(ctx.sessionId);
  ctx.logger.warn("队列已取消，Host 已关闭", { queueId: run.items[0].id });
}
function finalizeRun(ctx: HostContext, run: QueueRun, status: "done" | "canceled") {
  runTransaction(ctx.db.db, () => {
    for (const item of run.items) {
      ctx.db.setQueueStatus(item.id, status);
    }
    if (status === "canceled") {
      ctx.db.setControl(ctx.sessionId, "running");
    }
    deleteThreadData(ctx.db.db, run.threadId);
  });
  ctx.db.requestStorageReclaim();
}
export function setRunStatus(
  ctx: HostContext,
  run: QueueRun,
  status: QueueItem["status"],
  error?: ErrorDetails,
) {
  if (status === "paused") {
    ctx.db.pauseRun(ctx.sessionId, run.rootId, error);
  } else {
    runTransaction(ctx.db.db, () => {
      for (const item of run.items) {
        ctx.db.setQueueStatus(item.id, status, error);
      }
    });
  }
  ctx.observer?.changed?.(ctx.sessionId);
}
