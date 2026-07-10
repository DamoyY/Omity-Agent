import type { HookRule } from "../types";

export type HookCallDetails = {
  trigger: HookRule["on"];
  sourceId: string;
  hookId: string;
};

const hookCallPrefix = "omity-hook:";

export function encodeHookCallId(details: HookCallDetails) {
  return `${hookCallPrefix}${Buffer.from(JSON.stringify(details)).toString("base64url")}`;
}

export function isHookCallId(id: string | undefined): id is string {
  return id?.startsWith(hookCallPrefix) ?? false;
}

export function decodeHookCallId(id: string): HookCallDetails {
  if (!isHookCallId(id)) throw new Error(`无效 Hook 调用 ID：${id}`);
  const encoded = id.slice(hookCallPrefix.length);
  const parsed = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  if (!isHookCallDetails(parsed)) throw new Error(`无效 Hook 调用详情：${id}`);
  return parsed;
}

function isHookCallDetails(value: unknown): value is HookCallDetails {
  return (
    typeof value === "object" &&
    value !== null &&
    "trigger" in value &&
    ["user_message", "agent_end", "tool_before", "tool_after"].includes(
      String(value.trigger),
    ) &&
    "sourceId" in value &&
    typeof value.sourceId === "string" &&
    "hookId" in value &&
    typeof value.hookId === "string"
  );
}
