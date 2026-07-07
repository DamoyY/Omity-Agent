import type { DisplayToolCall } from "./types";

export function sameToolCall(a: DisplayToolCall, b: DisplayToolCall) {
  if (a.id === b.id) return true;
  if (a.index === b.index && (a.name === "tool" || b.name === "tool")) {
    return true;
  }
  return a.name === b.name && normalizedInput(a) === normalizedInput(b);
}

export function hasContentSegment(content: string, candidate: string) {
  const text = candidate.trim();
  if (text.length === 0) return true;
  return content.split("\n\n").some((segment) => segment.trim() === text);
}

function normalizedInput(call: DisplayToolCall) {
  return normalizeJsonText(call.inputText) ?? stableStringify(call.input);
}

function normalizeJsonText(text?: string) {
  if (!text) return undefined;
  try {
    return stableStringify(JSON.parse(text));
  } catch {
    return text.trim();
  }
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (!isRecord(value)) return JSON.stringify(value);
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
    .join(",")}}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
