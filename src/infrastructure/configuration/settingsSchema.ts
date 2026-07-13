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

const modelSettingsSchema = z.discriminatedUnion("provider", [
  z.object({
    provider: z.literal("openai-compatible"),
    api: z.enum(["responses", "completions"]),
    apiKeyEnv: z.string().min(1),
    baseURL: z.url().nullable(),
    ...sharedModelSettings,
  }),
  z.object({
    provider: z.literal("codex"),
    ...sharedModelSettings,
  }),
]);

const mainSettingsSchema = z.object({
  paths: z.object({
    dataDir: z.string().min(1),
  }),
  model: modelSettingsSchema,
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
});

export function parseMainSettings(value: unknown) {
  return mainSettingsSchema.parse(value);
}
