import type { HookRule, HookTrigger, HookWhen } from "../../types";
import { createHash } from "node:crypto";

export interface HookCallDetails {
  trigger: HookTrigger;
  sourceId: string;
  hookId: string;
}
const hookCallPrefix = "omity-hook:";
const hookCallPattern = /^omity-hook:[A-Za-z0-9_-]{43}$/;
export function hookTrigger(target: string, when: HookWhen): HookTrigger {
  return `${target}:${when}`;
}
export function hookCallDetails(rule: HookRule, sourceId: string): HookCallDetails {
  return {
    hookId: rule.id,
    sourceId,
    trigger: hookTrigger(rule.target, rule.when),
  };
}
export function createHookCallId(sessionId: string, threadId: string, details: HookCallDetails) {
  const identity = JSON.stringify([
    sessionId,
    threadId,
    details.trigger,
    details.sourceId,
    details.hookId,
  ]);
  const digest = createHash("sha256").update(identity).digest("base64url");
  return `${hookCallPrefix}${digest}`;
}
export function isHookCallId(id: string | undefined): id is string {
  return id !== undefined && hookCallPattern.test(id);
}
