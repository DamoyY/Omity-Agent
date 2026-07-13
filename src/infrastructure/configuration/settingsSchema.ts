import { z } from "zod";

const reasoningEffortSchema = z.enum([
  "none",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
]);

const sharedModelSettings = {
  model: z.string().min(1),
  temperature: z.number().optional(),
  reasoning_effort: reasoningEffortSchema.optional(),
  maxRetries: z.number().int().nonnegative(),
  timeoutMs: z.number().int().positive(),
};

const modelSettingsSchema = z.discriminatedUnion("adapter", [
  z
    .object({
      adapter: z.enum(["responses", "completions"]),
      apiKeyEnv: z.string().min(1),
      baseURL: z.url().nullable(),
      ...sharedModelSettings,
    })
    .strict(),
  z
    .object({
      adapter: z.literal("codex"),
      ...sharedModelSettings,
    })
    .strict(),
]);

const modelFileSchema = z
  .object({
    profile: z.string().min(1),
    profiles: z.record(z.string().min(1), modelSettingsSchema),
  })
  .strict();

const suffixSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(2)
  .max(32)
  .regex(/^\.[a-z0-9][a-z0-9_+-]*$/u);

const mainSettingsSchema = z
  .object({
    paths: z.object({
      dataDir: z.string().min(1),
    }),
    attachments: z
      .object({
        allowedSuffixes: z
          .array(suffixSchema)
          .min(1)
          .superRefine((suffixes, context) => {
            if (new Set(suffixes).size !== suffixes.length) {
              context.addIssue({
                code: "custom",
                message: "附件后缀白名单不能包含重复项",
              });
            }
          }),
        maxSizeBytes: z
          .number()
          .int()
          .positive()
          .max(Number.MAX_SAFE_INTEGER - 1024 * 1024),
      })
      .strict(),
    frontend: z.object({
      draftSaveDelayMs: z.number().int().positive(),
      transcriptRefreshIntervalMs: z.number().int().positive(),
    }),
    host: z.object({
      pollMs: z.number().int().positive(),
      pausePollMs: z.number().int().positive(),
      idleLogMs: z.number().int().positive(),
      recursionLimit: z.number().int().positive(),
    }),
    logging: z.object({
      level: z.enum(["debug", "info", "warn", "error"]),
      streamTokens: z.boolean(),
    }),
    leases: z.object({
      hostTtlMs: z.number().int().positive(),
      hookTtlMs: z.number().int().positive(),
    }),
    toolOutput: z.object({
      maxTokens: z.number().int().positive(),
    }),
    skills: z.object({
      enabled: z.boolean(),
      directory: z.string().min(1),
      skillEnabled: z.record(z.string(), z.boolean()),
    }),
  })
  .strict();

export function parseMainSettings(value: unknown) {
  return mainSettingsSchema.parse(value);
}

export function parseModelSettings(value: unknown) {
  const { profile, profiles } = modelFileSchema.parse(value);
  const model = profiles[profile];
  if (model === undefined) throw new Error(`Profile 不存在：${profile}`);
  return model;
}
