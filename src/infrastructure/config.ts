import { mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import YAML from "yaml";
import { z } from "zod";
import type { Settings } from "../types";
import { loadHookRules } from "../hooks/config";
import { normalizeWorkspacePath } from "./workspacePath";

const reasoningEffortSchema = z.enum([
  "none",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
]);

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
    reasoning_effort: reasoningEffortSchema.optional(),
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
  toolOutput: z.object({
    maxTokens: z.number().int().positive(),
  }),
  skills: z.object({
    enabled: z.boolean(),
    directory: z.string().min(1),
    skillEnabled: z.record(z.string(), z.boolean()),
  }),
});

export interface LoadSettingsOptions {
  cwd?: string;
}

export function loadSettings(
  root = process.cwd(),
  options: LoadSettingsOptions = {},
): Settings {
  const configRoot = resolve(root);
  const cwd = normalizeWorkspacePath(options.cwd ?? configRoot, configRoot);
  const settingsDir = resolve(configRoot, "settings");
  const main = mainSchema.parse(readYaml(resolve(settingsDir, "main.yaml")));
  const hooks = loadHookRules(resolve(settingsDir, "hooks.yaml"));
  const promptsDir = resolve(settingsDir, "prompts");
  const promptContext = { cwd };
  const dataDir = resolveConfigPath(configRoot, main.paths.dataDir);
  const skillsDirectory = resolveConfigPath(configRoot, main.skills.directory);
  mkdirSync(dataDir, { recursive: true });
  return {
    ...main,
    hooks,
    agent: {
      systemPrompt: readPrompt(join(promptsDir, "system.md"), {
        context: promptContext,
      }),
    },
    skills: {
      ...main.skills,
      usagePrompt: readPrompt(join(promptsDir, "skills.md"), {
        nonEmpty: true,
        context: promptContext,
      }),
      directory: skillsDirectory,
    },
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
  const hookDb = resolve(dir, "hooks.sqlite");
  return { dir, appDb, checkpointDb, hookDb };
}

export function safeId(value: string) {
  if (
    value.length === 0 ||
    value.length > 128 ||
    value === "." ||
    value === ".." ||
    !/^[a-zA-Z0-9._-]+$/.test(value)
  ) {
    throw new Error(`路径 ID 无效：${value}`);
  }
  return value;
}

function readYaml(path: string): unknown {
  return YAML.parse(readFileSync(path, "utf8")) as unknown;
}

function readPrompt(
  path: string,
  options: { context: PromptContext; nonEmpty?: boolean },
) {
  const content = expandPromptPlaceholders(
    readFileSync(path, "utf8").trimEnd(),
    options.context,
  );
  if (options.nonEmpty && content.length === 0) {
    throw new Error(`提示词文件不能为空：${path}`);
  }
  return content;
}

interface PromptContext {
  cwd: string;
}

function expandPromptPlaceholders(content: string, context: PromptContext) {
  return content.replaceAll("${cwd}", context.cwd);
}

function resolveConfigPath(root: string, path: string) {
  const withAppData = path.replaceAll("${appData}", appDataRoot());
  const expanded =
    withAppData === "~" ||
    withAppData.startsWith("~/") ||
    withAppData.startsWith("~\\")
      ? resolve(homedir(), withAppData.slice(2))
      : withAppData;
  return isAbsolute(expanded) ? resolve(expanded) : resolve(root, expanded);
}

export function appDataRoot() {
  if (process.platform === "win32") {
    const path = process.env["APPDATA"];
    if (!path) {
      throw new Error("缺少环境变量 APPDATA，无法定位用户 AppData 目录");
    }
    return path;
  }
  if (process.platform === "darwin") {
    return join(homedir(), "Library", "Application Support");
  }
  return process.env["XDG_DATA_HOME"] ?? join(homedir(), ".local", "share");
}
