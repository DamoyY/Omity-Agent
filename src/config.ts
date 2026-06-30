import { mkdirSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import YAML from "yaml";
import { z } from "zod";
import type { Settings } from "./types";

const schema = z.object({
  paths: z.object({
    dataDir: z.string().min(1),
  }),
  model: z.object({
    provider: z.literal("openai-compatible"),
    model: z.string().min(1),
    apiKeyEnv: z.string().min(1),
    baseURL: z.string().url().nullable(),
    temperature: z.number(),
    maxRetries: z.number().int().nonnegative(),
    timeoutMs: z.number().int().positive(),
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
  agent: z.object({
    systemPrompt: z.string(),
  }),
});

export function loadSettings(root = process.cwd()): Settings {
  const path = resolve(root, "settings.yaml");
  const parsed = YAML.parse(readFileSync(path, "utf8"));
  const settings = schema.parse(parsed);
  const dataDir = isAbsolute(settings.paths.dataDir) ? settings.paths.dataDir : resolve(root, settings.paths.dataDir);
  mkdirSync(dataDir, { recursive: true });
  return { ...settings, paths: { dataDir } };
}

export function sessionPaths(settings: Settings, sessionId: string) {
  const dir = resolve(settings.paths.dataDir, "sessions", safeId(sessionId));
  mkdirSync(dir, { recursive: true });
  const appDb = resolve(dir, "agent.sqlite");
  const checkpointDb = resolve(dir, "checkpoints.sqlite");
  mkdirSync(dirname(appDb), { recursive: true });
  return { dir, appDb, checkpointDb };
}

export function safeId(value: string) {
  const safe = value.replaceAll(/[^a-zA-Z0-9._-]/g, "_");
  if (safe.length === 0) {
    throw new Error("会话 ID 不能为空");
  }
  return safe;
}
