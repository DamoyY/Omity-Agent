import { readFileSync } from "node:fs";
import YAML from "yaml";
import { z } from "zod";
import type { HookRule } from "../types";

const argsSchema = z.record(z.string(), z.unknown());
const callFields = {
  id: z.string().min(1),
  tool: z.string().min(1),
  args: argsSchema,
};

const hookSchema = z.discriminatedUnion("on", [
  z
    .object({
      ...callFields,
      on: z.literal("user_message"),
      mode: z.enum(["silent", "takeover"]),
    })
    .strict(),
  z
    .object({
      ...callFields,
      on: z.literal("agent_end"),
      mode: z.literal("silent"),
    })
    .strict(),
  z
    .object({
      ...callFields,
      on: z.literal("tool_before"),
      mode: z.enum(["silent", "takeover"]),
      matchTool: z.string().min(1),
    })
    .strict(),
  z
    .object({
      ...callFields,
      on: z.literal("tool_after"),
      mode: z.enum(["silent", "takeover"]),
      matchTool: z.string().min(1),
    })
    .strict(),
]);

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
