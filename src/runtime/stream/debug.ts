import stableStringify from "fast-json-stable-stringify";

const omitted = Symbol("omitted");
type DiffResult = { value: unknown } | typeof omitted;
interface SeenState {
  seenFacts: Set<string>;
  seenStructures: Set<string>;
}

export function incrementalSummary(value: unknown, state: SeenState): unknown {
  const delta = diffSeen(value, state, "$");
  return delta === omitted ? undefined : summarize(delta.value);
}
function diffSeen(value: unknown, state: SeenState, key: string): DiffResult {
  if (isRecord(value)) {
    const hash = stableStringify(value);
    if (state.seenStructures.has(hash)) {
      return omitted;
    }
    state.seenStructures.add(hash);
    const entries = Object.entries(value)
      .map(([name, child]) => [name, diffSeen(child, state, name)] as const)
      .filter((entry): entry is readonly [string, { value: unknown }] => entry[1] !== omitted);
    if (entries.length === 0) {
      return omitted;
    }
    return { value: Object.fromEntries(entries.map(([name, child]) => [name, child.value])) };
  }
  if (Array.isArray(value)) {
    const hash = stableStringify(value);
    if (state.seenStructures.has(hash)) {
      return omitted;
    }
    state.seenStructures.add(hash);
    const items = value.map((child) => diffSeen(child, state, key)).filter(isIncluded);
    return items.length === 0 ? omitted : { value: items.map((item) => item.value) };
  }
  const fact = `${key}:${stableStringify(value)}`;
  if (state.seenFacts.has(fact)) {
    return omitted;
  }
  state.seenFacts.add(fact);
  return { value };
}
function isIncluded(value: DiffResult): value is { value: unknown } {
  return value !== omitted;
}
function summarize(value: unknown) {
  if (value === undefined) {
    return undefined;
  }
  const json = JSON.stringify(value, (_key, current: unknown) =>
    typeof current === "string" && current.length > 240 ? `${current.slice(0, 240)}…` : current,
  );
  return JSON.parse(json) as unknown;
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
