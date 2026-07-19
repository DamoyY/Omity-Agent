import { AIMessage, AIMessageChunk, type BaseMessage, ToolMessage } from "@langchain/core/messages";
import { acceptMessageId, createStreamPartState, sequentialPart, toolPart } from "./stream/parts";
import { contentToText, streamedMessageReasoning } from "./content";
import type { HostContext } from "./context";
import { incrementalSummary } from "./stream/debug";

export { incrementalSummary } from "./stream/debug";
export interface StreamLogState {
  parts: ReturnType<typeof createStreamPartState>;
  seenFacts: Set<string>;
  seenStructures: Set<string>;
}
export function createStreamLogState(): StreamLogState {
  return {
    parts: createStreamPartState(),
    seenFacts: new Set(),
    seenStructures: new Set(),
  };
}
export function handleStreamEvent(
  ctx: HostContext,
  event: unknown,
  state = createStreamLogState(),
  queueId?: number,
) {
  if (!Array.isArray(event) || event.length !== 2) {
    logIncrement(ctx, "LangGraph 事件增量", event, state);
    return;
  }
  const [mode, payload] = event;
  if (mode !== "messages") {
    logIncrement(ctx, mode === "updates" ? "状态更新增量" : "调试事件增量", payload, state);
    return;
  }
  const [chunk] = Array.isArray(payload) ? payload : [];
  if (!isAiChunk(chunk)) {
    return;
  }
  const messageId = acceptMessageId(state.parts, readMessageId(chunk));
  const text = contentToText(chunk.content);
  const reasoning = streamedMessageReasoning(chunk, state.parts.reasoning);
  const calls = toolCallDeltas(chunk);
  if (!reasoning && !text && calls.length === 0) {
    return;
  }
  if (queueId === undefined) {
    return;
  }
  if (!messageId) {
    throw new Error("模型流增量缺少稳定消息 ID");
  }
  if (text && ctx.settings.logging.streamTokens) {
    ctx.logger.token(text);
  }
  if (reasoning) {
    ctx.db.appendStream(ctx.sessionId, {
      kind: "assistant_reasoning_delta",
      messageId,
      partId: sequentialPart(state.parts, "assistant_reasoning_delta"),
      queueId,
      value: reasoning,
    });
  }
  if (text) {
    ctx.db.appendStream(ctx.sessionId, {
      kind: "assistant_text_delta",
      messageId,
      partId: sequentialPart(state.parts, "assistant_text_delta"),
      queueId,
      value: text,
    });
    ctx.observer?.token(ctx.sessionId, queueId, text);
  }
  for (const call of calls) {
    ctx.db.appendStream(ctx.sessionId, {
      kind: "tool_call_delta",
      messageId,
      partId: toolPart(state.parts, call.index),
      queueId,
      value: call,
    });
  }
}
export function discardActiveStream(ctx: HostContext, state: StreamLogState, queueId: number) {
  ctx.db.discardQueueStream(queueId);
  ctx.observer?.changed?.(ctx.sessionId);
  state.parts = createStreamPartState();
}
export function completeActiveStream(state: StreamLogState) {
  state.parts = createStreamPartState();
}
export function recordToolExecutionStarted(
  ctx: HostContext,
  messages: BaseMessage[],
  queueId: number,
) {
  const completed = new Set(
    messages
      .filter((message) => ToolMessage.isInstance(message))
      .map((message) => message.tool_call_id),
  );
  const request = messages.findLast((message) => AIMessage.isInstance(message));
  if (!request || !AIMessage.isInstance(request) || !request.id) {
    throw new Error("工具执行缺少稳定的请求消息 ID");
  }
  const index = request.tool_calls?.findIndex(
    (candidate) => !candidate.id || !completed.has(candidate.id),
  );
  if (index === undefined || index < 0) {
    throw new Error("工具执行缺少稳定的调用 ID");
  }
  const call = request.tool_calls?.[index];
  if (!call?.id) {
    throw new Error("工具执行缺少稳定的调用 ID");
  }
  ctx.toolExecutions?.announce(call.id);
  ctx.db.appendStream(ctx.sessionId, {
    kind: "tool_started",
    messageId: request.id,
    partId: `tool-${index.toString()}`,
    queueId,
    value: call.id,
  });
}
function toolCallDeltas(chunk: AIMessageChunk) {
  const result = [];
  for (const call of chunk.tool_call_chunks ?? []) {
    const { index } = call;
    if (index === undefined || !Number.isSafeInteger(index) || index < 0) {
      throw new Error("工具调用流增量缺少有效索引");
    }
    result.push({
      index,
      ...(typeof call.args === "string" ? { argumentsDelta: call.args } : {}),
      ...(Reflect.get(call, "isCustomTool") === true ? { freeform: true } : {}),
      ...(typeof call.id === "string" ? { idDelta: call.id } : {}),
      ...(typeof call.name === "string" ? { nameDelta: call.name } : {}),
    });
  }
  return result;
}
function logIncrement(ctx: HostContext, label: string, value: unknown, state: StreamLogState) {
  const delta = incrementalSummary(value, state);
  if (delta !== undefined) {
    ctx.logger.debug(label, delta);
  }
}
function isAiChunk(value: unknown): value is AIMessageChunk {
  return AIMessageChunk.isInstance(value);
}
function readMessageId(value: AIMessageChunk) {
  return value.id ?? stringField(value.response_metadata, "id");
}
function stringField(value: unknown, key: string) {
  return isRecord(value) && typeof value[key] === "string" ? value[key] : undefined;
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
