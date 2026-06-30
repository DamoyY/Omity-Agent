import { mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, resolve } from "node:path";
import YAML from "yaml";
import { z } from "zod";
import type { Settings } from "../types";

const mainSchema = z.object({
  paths: z.object({
    dataDir: z.string().min(1),
  }),
  model: z.object({
    provider: z.literal("openai-compatible"),
    api: z.enum(["responses", "completions"]),
    model: z.string().min(1),
    apiKeyEnv: z.string().min(1),
    baseURL: z.url().nullable(),
    temperature: z.number().optional(),
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
  skills: z.object({
    enabled: z.boolean(),
    directory: z.string().min(1),
    skillEnabled: z.record(z.string(), z.boolean()),
  }),
});

const promptsSchema = z.object({
  agent: z.object({
    systemPrompt: z.string(),
  }),
  skills: z.object({
    usagePrompt: z.string().min(1),
  }),
});

export function loadSettings(root = process.cwd()): Settings {
  const settingsDir = resolve(root, "settings");
  const main = mainSchema.parse(readYaml(resolve(settingsDir, "main.yaml")));
  const prompts = promptsSchema.parse(
    readYaml(resolve(settingsDir, "prompts.yaml")),
  );
  const dataDir = isAbsolute(main.paths.dataDir)
    ? main.paths.dataDir
    : resolve(root, main.paths.dataDir);
  const skillsDirectory = resolveConfigPath(root, main.skills.directory);
  mkdirSync(dataDir, { recursive: true });
  return {
    ...main,
    agent: prompts.agent,
    skills: { ...main.skills, ...prompts.skills, directory: skillsDirectory },
    paths: { dataDir },
  };
}

export function sessionPaths(settings: Settings, sessionId: string) {
  const paths = resolveSessionPaths(settings, sessionId);
  mkdirSync(paths.dir, { recursive: true });
  mkdirSync(dirname(paths.appDb), { recursive: true });
  return paths;
}

export function resolveSessionPaths(settings: Settings, sessionId: string) {
  const dir = resolve(settings.paths.dataDir, "sessions", safeId(sessionId));
  const appDb = resolve(dir, "agent.sqlite");
  const checkpointDb = resolve(dir, "checkpoints.sqlite");
  return { dir, appDb, checkpointDb };
}

export function safeId(value: string) {
  const safe = value.replaceAll(/[^a-zA-Z0-9._-]/g, "_");
  if (safe.length === 0) {
    throw new Error("会话 ID 不能为空");
  }
  return safe;
}

function readYaml(path: string) {
  return YAML.parse(readFileSync(path, "utf8"));
}

function resolveConfigPath(root: string, path: string) {
  const expanded =
    path === "~" || path.startsWith("~/") || path.startsWith("~\\")
      ? resolve(homedir(), path.slice(2))
      : path;
  return isAbsolute(expanded) ? expanded : resolve(root, expanded);
}
