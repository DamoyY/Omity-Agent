import type { BaseMessage } from "@langchain/core/messages";
import type { QueueItem } from "../types";
import { contentToText } from "./content";
import type { HostContext } from "./context";

export class CanceledRun extends Error {}

export type QueueRun = {
  items: [QueueItem, ...QueueItem[]];
  threadId: string;
};

export function finishRun(
  ctx: HostContext,
  run: QueueRun,
  messages: BaseMessage[],
) {
  const last = messages.findLast((message) => message.type === "ai");
  const content = contentToText(last?.content);
  if (!content) throw new Error("模型没有生成可记录的最终文本");
  const lastItem = run.items.at(-1);
  if (!lastItem) throw new Error("运行没有可记录的队列项");
  ctx.db.appendAssistant(ctx.sessionId, lastItem.id, content);
  setRunStatus(ctx, run, "done");
  ctx.logger.info("队列完成", { queueId: lastItem.id, chars: content.length });
  if (ctx.settings.logging.streamTokens) process.stdout.write("\n");
}

export async function cancelRun(ctx: HostContext, run: QueueRun) {
  setRunStatus(ctx, run, "canceled");
  ctx.db.setControl(ctx.sessionId, "running");
  await ctx.checkpointer.deleteThread(run.threadId);
  ctx.signal.stopping = true;
  ctx.logger.warn("队列已取消，Host 已关闭", { queueId: run.items[0].id });
}

export function setRunStatus(
  ctx: HostContext,
  run: QueueRun,
  status: QueueItem["status"],
  error?: string,
) {
  for (const item of run.items) ctx.db.setQueueStatus(item.id, status, error);
}
