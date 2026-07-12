import {
  AIMessage,
  AIMessageChunk,
  type BaseMessage,
} from "@langchain/core/messages";
import stableStringify from "fast-json-stable-stringify";
import type { HostContext } from "./context";
import {
  contentToText,
  createReasoningStreamState,
  type ReasoningStreamState,
  streamedMessageReasoning,
} from "./content";

const omitted = Symbol("omitted");
type DiffResult = { value: unknown } | typeof omitted;

export interface StreamLogState {
  reasoning: ReasoningStreamState;
  seenFacts: Set<string>;
  seenStructures: Set<string>;
}

export function createStreamLogState(): StreamLogState {
  return {
    reasoning: createReasoningStreamState(),
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
    const delta = incrementalSummary(event, state);
    if (delta !== undefined) ctx.logger.debug("LangGraph 事件增量", delta);
    return;
  }
  const mode: unknown = event[0];
  const payload: unknown = event[1];
  if (mode === "messages") {
    const chunk: unknown = Array.isArray(payload) ? payload[0] : undefined;
    if (!isAiChunk(chunk)) return;
    const messageId = readMessageId(chunk);
    const text = contentToText(chunk.content);
    const reasoning = streamedMessageReasoning(chunk, state.reasoning);
    if (text && ctx.settings.logging.streamTokens) {
      ctx.logger.token(text);
    }
    if (reasoning && queueId !== undefined) {
      ctx.db.streamReasoning(ctx.sessionId, queueId, reasoning, messageId);
    }
    if (text && queueId !== undefined) {
      ctx.db.streamToken(ctx.sessionId, queueId, text, messageId);
      ctx.observer?.token(ctx.sessionId, queueId, text);
    }
    for (const call of toolCallDeltas(chunk)) {
      if (queueId !== undefined)
        ctx.db.streamToolCall(ctx.sessionId, queueId, call, messageId);
    }
    return;
  }
  if (mode === "updates") {
    const delta = incrementalSummary(payload, state);
    if (delta !== undefined) ctx.logger.debug("状态更新增量", delta);
    return;
  }
  const delta = incrementalSummary(payload, state);
  if (delta !== undefined) ctx.logger.debug("调试事件增量", delta);
}

export function recordToolExecutionStarted(
  ctx: HostContext,
  messages: BaseMessage[],
  queueId: number,
) {
  const request = messages.findLast((message) => AIMessage.isInstance(message));
  if (!request || !AIMessage.isInstance(request)) return;
  for (const call of request.tool_calls ?? []) {
    if (call.id) ctx.db.toolStarted(ctx.sessionId, queueId, call.id);
  }
}

export function incrementalSummary(
  value: unknown,
  state: StreamLogState,
): unknown {
  const delta = diffSeen(value, state, "$");
  return delta === omitted ? undefined : summarize(delta.value);
}

function diffSeen(
  value: unknown,
  state: StreamLogState,
  key: string,
): DiffResult {
  if (isRecord(value)) {
    const hash = stableStringify(value);
    if (state.seenStructures.has(hash)) return omitted;
    state.seenStructures.add(hash);
    const entries = Object.entries(value)
      .map(([name, child]) => [name, diffSeen(child, state, name)] as const)
      .filter(
        (entry): entry is readonly [string, { value: unknown }] =>
          entry[1] !== omitted,
      );
    if (entries.length === 0) return omitted;
    return {
      value: Object.fromEntries(
        entries.map(([name, child]) => [name, child.value]),
      ),
    };
  }
  if (Array.isArray(value)) {
    const hash = stableStringify(value);
    if (state.seenStructures.has(hash)) return omitted;
    state.seenStructures.add(hash);
    const items = value
      .map((child) => diffSeen(child, state, key))
      .filter(isIncluded);
    return items.length === 0
      ? omitted
      : { value: items.map((item) => item.value) };
  }
  const fact = `${key}:${stableStringify(value)}`;
  if (state.seenFacts.has(fact)) return omitted;
  state.seenFacts.add(fact);
  return { value };
}

function isIncluded(value: DiffResult): value is { value: unknown } {
  return value !== omitted;
}

function summarize(value: unknown) {
  if (value === undefined) return undefined;
  const json = JSON.stringify(value, (_key, current: unknown) =>
    typeof current === "string" && current.length > 240
      ? `${current.slice(0, 240)}…`
      : current,
  );
  return JSON.parse(json) as unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isAiChunk(value: unknown): value is AIMessageChunk {
  return AIMessageChunk.isInstance(value);
}

function readMessageId(value: unknown) {
  return isRecord(value) && typeof value["id"] === "string"
    ? value["id"]
    : undefined;
}

function toolCallDeltas(chunk: unknown) {
  if (!isRecord(chunk) || !Array.isArray(chunk["tool_call_chunks"])) {
    return [];
  }
  return chunk["tool_call_chunks"].filter(isRecord).map((call) => ({
    ...(typeof call["args"] === "string" ? { args: call["args"] } : {}),
    ...(typeof call["id"] === "string" ? { id: call["id"] } : {}),
    ...(typeof call["index"] === "number" ? { index: call["index"] } : {}),
    ...(typeof call["name"] === "string" ? { name: call["name"] } : {}),
  }));
}
