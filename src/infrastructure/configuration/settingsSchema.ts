import ipaddr from "ipaddr.js";
import { z } from "zod";

const reasoningEffortSchema = z.enum(["none", "minimal", "low", "medium", "high", "xhigh"]);
const sharedModelSettings = {
  model: z.string().min(1),
  reasoning_effort: reasoningEffortSchema.optional(),
  temperature: z.number().optional(),
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
const publicOriginSchema = z
  .url()
  .refine((value) => {
    const url = new URL(value);
    return url.protocol === "https:" && url.origin === value;
  }, "公网 Origin 必须是无路径、查询参数和片段的 HTTPS Origin")
  .nullable();
const cidrSchema = z
  .string()
  .refine((value) => ipaddr.isValidCIDR(value), "可信代理必须使用有效的 CIDR");
const accessSchema = z
  .object({
    challengeTtlMs: z.number().int().min(1000).max(86_400_000),
    loginRateLimit: z
      .object({
        attempts: z.number().int().positive().max(1000),
        windowMs: z.number().int().min(1000).max(86_400_000),
      })
      .strict(),
    publicOrigin: publicOriginSchema,
    sessionTtlMs: z.number().int().min(60_000).max(2_592_000_000),
    trustedProxies: z.array(cidrSchema),
  })
  .strict()
  .refine(
    ({ publicOrigin, trustedProxies }) => publicOrigin === null || trustedProxies.length > 0,
    "配置公网 Origin 时必须配置 trustedProxies",
  );
const mainSettingsSchema = z
  .object({
    access: accessSchema,
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
      idleLogMs: z.number().int().positive(),
      pausePollMs: z.number().int().positive(),
      pollMs: z.number().int().positive(),
      recursionLimit: z.number().int().positive(),
      shutdownTimeoutMs: z.number().int().positive(),
    }),
    leases: z.object({
      hostTtlMs: z.number().int().positive(),
    }),
    logging: z.object({
      level: z.enum(["debug", "info", "warn", "error"]),
      streamTokens: z.boolean(),
    }),
    paths: z.object({
      dataDir: z.string().min(1),
    }),
    skills: z.object({
      directory: z.string().min(1),
      enabled: z.boolean(),
      skillEnabled: z.record(z.string(), z.boolean()),
    }),
    toolOutput: z.object({
      maxTokens: z.number().int().positive(),
    }),
  })
  .strict();
export function parseMainSettings(value: unknown) {
  return mainSettingsSchema.parse(value);
}
export function parseModelSettings(value: unknown) {
  const { profile, profiles } = modelFileSchema.parse(value);
  const model = profiles[profile];
  if (model === undefined) {
    throw new Error(`Profile 不存在：${profile}`);
  }
  return model;
}
