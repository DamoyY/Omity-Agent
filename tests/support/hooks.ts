import type { HookRule } from "../../src/types";

export function hookRule(
  id: string,
  when: HookRule["when"],
  mode: HookRule["mode"],
  args: Record<string, unknown>,
): HookRule {
  return {
    id,
    target: "original",
    when,
    runLimit: -1,
    mode,
    args,
    tool: "hook",
  };
}
