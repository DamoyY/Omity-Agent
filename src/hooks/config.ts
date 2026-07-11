import { readFileSync } from "node:fs";
import YAML from "yaml";
import { z } from "zod";
import type { HookRule } from "../types";

const argsSchema = z.record(z.string(), z.unknown());
const callFields = {
  id: z.string().min(1),
  target: z.string().min(1),
  when: z.enum(["before", "after"]),
  runLimit: z.number().int().min(-1),
  tool: z.string().min(1),
  args: argsSchema,
};

const hookSchema = z
  .discriminatedUnion("mode", [
    z
      .object({
        ...callFields,
        mode: z.literal("silent"),
      })
      .strict(),
    z
      .object({
        ...callFields,
        mode: z.literal("takeover"),
      })
      .strict(),
  ])
  .superRefine((hook, context) => {
    if (
      hook.target === "agent" &&
      hook.when === "after" &&
      hook.mode === "takeover"
    ) {
      context.addIssue({
        code: "custom",
        message: "agent after Hook 仅支持 silent 模式",
        path: ["mode"],
      });
    }
  });

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
  const parsed = YAML.parse(readFileSync(path, "utf8"));
  return hooksFileSchema.parse(parsed).hooks;
}
