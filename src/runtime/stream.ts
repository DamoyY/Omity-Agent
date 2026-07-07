import { AIMessageChunk } from "@langchain/core/messages";
import type { HostContext } from "./context";
import { contentToText } from "./content";

const omitted = Symbol("omitted");

export type StreamLogState = {
  seenFacts: Set<string>;
  seenStructures: Set<string>;
};

export function createStreamLogState(): StreamLogState {
  return {
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
  const [mode, payload] = event;
  if (mode === "messages") {
    const chunk = Array.isArray(payload) ? payload[0] : undefined;
    if (!isAiChunk(chunk)) return;
    const text = contentToText(chunk?.content);
    if (text && ctx.settings.logging.streamTokens) {
      ctx.logger.token(text);
    }
    if (text && queueId !== undefined) {
      ctx.db.streamToken(ctx.sessionId, queueId, text);
      ctx.observer?.token(ctx.sessionId, queueId, text);
    }
    for (const call of toolCallDeltas(chunk)) {
      if (queueId !== undefined)
        ctx.db.streamToolCall(ctx.sessionId, queueId, call);
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

export function incrementalSummary(
  value: unknown,
  state: StreamLogState,
): unknown | undefined {
  const delta = diffSeen(value, state, "$");
  return delta === omitted ? undefined : summarize(delta);
}

function diffSeen(
  value: unknown,
  state: StreamLogState,
  key: string,
): unknown | typeof omitted {
  if (isRecord(value)) {
    const hash = stableStringify(value);
    if (state.seenStructures.has(hash)) return omitted;
    state.seenStructures.add(hash);
    const entries = Object.entries(value)
      .map(([name, child]) => [name, diffSeen(child, state, name)] as const)
      .filter(([, child]) => child !== omitted);
    if (entries.length === 0) return omitted;
    return Object.fromEntries(entries);
  }
  if (Array.isArray(value)) {
    const hash = stableStringify(value);
    if (state.seenStructures.has(hash)) return omitted;
    state.seenStructures.add(hash);
    const items = value
      .map((child) => diffSeen(child, state, key))
      .filter((child) => child !== omitted);
    return items.length === 0 ? omitted : items;
  }
  const fact = `${key}:${stableStringify(value)}`;
  if (state.seenFacts.has(fact)) return omitted;
  state.seenFacts.add(fact);
  return value;
}

function summarize(value: unknown) {
  return JSON.parse(
    JSON.stringify(value, (_key, current) =>
      typeof current === "string" && current.length > 240
        ? `${current.slice(0, 240)}…`
        : current,
    ),
  );
}

function stableStringify(value: unknown): string {
  return JSON.stringify(stableValue(value));
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, stableValue(value[key])]),
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isAiChunk(value: unknown) {
  if (AIMessageChunk.isInstance(value)) return true;
  return isRecord(value) && value["type"] === "ai";
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
