import type { HookRule } from "../../types";
import YAML from "yaml";
import { readFileSync } from "node:fs";
import { z } from "zod";
const argsSchema = z.record(z.string(), z.unknown());
const callFields = {
  args: argsSchema,
  id: z.string().min(1),
  runLimit: z.number().int().min(-1),
  target: z.string().min(1),
  tool: z.string().min(1),
  when: z.enum(["before", "after"]),
};
const hookSchema = z.object({ ...callFields, mode: z.enum(["silent", "takeover"]) }).strict();
const hooksFileSchema = z
  .object({ hooks: z.array(hookSchema) })
  .strict()
  .superRefine(({ hooks }, context) => {
    const ids = new Set<string>();
    for (const [index, hook] of hooks.entries()) {
      if (ids.has(hook.id)) {
        context.addIssue({
          code: "custom",
          message: `Hook id 重复：${hook.id}`,
          path: ["hooks", index, "id"],
        });
      }
      ids.add(hook.id);
    }
  });
export function loadHookRules(path: string): HookRule[] {
  const parsed: unknown = YAML.parse(readFileSync(path, "utf8"));
  return hooksFileSchema.parse(parsed).hooks;
}
