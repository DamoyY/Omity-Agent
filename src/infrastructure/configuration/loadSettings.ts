import { join, resolve } from "node:path";
import { mkdirSync, readFileSync } from "node:fs";
import { parseMainSettings, parseModelSettings } from "./settingsSchema";
import type { Settings } from "../../types";
import YAML from "yaml";
import { loadHookRules } from "./hookRules";
import { normalizeWorkspacePath } from "./workspacePath";
import { resolveConfiguredPath } from "./configuredPath";

export interface LoadSettingsOptions {
  cwd?: string;
}
export function loadSettings(root = process.cwd(), options: LoadSettingsOptions = {}): Settings {
  const configRoot = resolve(root);
  const cwd = normalizeWorkspacePath(options.cwd ?? configRoot, configRoot);
  const settingsDir = resolve(configRoot, "settings");
  const main = parseMainSettings(readYaml(resolve(settingsDir, "main.yaml")));
  const model = parseModelSettings(readYaml(resolve(settingsDir, "model.yaml")));
  const promptsDir = resolve(settingsDir, "prompts");
  const context = { cwd };
  const dataDir = resolveConfiguredPath(configRoot, main.paths.dataDir);
  mkdirSync(dataDir, { recursive: true });
  return {
    ...main,
    agent: {
      systemPrompt: readPrompt(join(promptsDir, "system.md"), context),
    },
    hooks: loadHookRules(resolve(settingsDir, "hooks.yaml")),
    model,
    paths: { dataDir },
    skills: {
      ...main.skills,
      directory: resolveConfiguredPath(configRoot, main.skills.directory),
      usagePrompt: readPrompt(join(promptsDir, "skills.md"), context, true),
    },
  };
}
function readYaml(path: string): unknown {
  return YAML.parse(readFileSync(path, "utf8")) as unknown;
}
function readPrompt(path: string, context: { cwd: string }, nonEmpty = false) {
  const content = readFileSync(path, "utf8").trimEnd().replaceAll(`\${cwd}`, context.cwd);
  if (nonEmpty && content.length === 0) {
    throw new Error(`提示词文件不能为空：${path}`);
  }
  return content;
}
