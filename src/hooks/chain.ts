import type { HookWhen } from "../types";
import * as callStorage from "./storage/calls";
import type { HookRuntime } from "./runtime";

export interface SilentChainOptions {
  signal?: AbortSignal;
  previousInvocationKey?: string;
}

export async function runSilentChain(
  runtime: HookRuntime,
  target: string,
  when: HookWhen,
  sourceId: string,
  threadId: string,
  options: SilentChainOptions,
) {
  let previousInvocationKey = options.previousInvocationKey;
  for (const rule of runtime.matching(target, when)) {
    if (!runtime.shouldRun(rule, sourceId, threadId)) continue;
    if (rule.mode !== "silent") {
      throw new Error(
        `${callStorage.hookTrigger(target, when)} 不能在图外执行接管 Hook`,
      );
    }
    await runtime.runSilent(
      rule,
      sourceId,
      threadId,
      options.signal,
      previousInvocationKey,
    );
    previousInvocationKey = runtime.identity.hook(rule, sourceId, threadId);
  }
}
