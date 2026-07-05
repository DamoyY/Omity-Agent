import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, expect, test } from "bun:test";
import {
  appDataRoot,
  loadSettings,
  safeId,
  sessionPaths,
} from "../src/infrastructure/config";

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("settings yaml resolves AppData data directory", () => {
  const root = mkdtempSync(join(tmpdir(), "agent-config-"));
  const settingsDir = join(root, "settings");
  const appData = join(root, "app-data");
  dirs.push(root);
  mkdirSync(settingsDir);
  writeFileSync(
    join(settingsDir, "main.yaml"),
    "paths:\n  dataDir: ${appData}/omity-agent\nmodel:\n  provider: openai-compatible\n  api: completions\n  model: test\n  apiKeyEnv: TEST_KEY\n  baseURL: null\n  temperature: 0\n  reasoning_effort: medium\n  maxRetries: 0\n  timeoutMs: 1000\nhost:\n  pollMs: 1\n  pausePollMs: 1\n  idleLogMs: 1\n  recursionLimit: 1\nlogging:\n  level: debug\n  streamTokens: false\ntoolOutput:\n  maxTokens: 8192\nskills:\n  enabled: false\n  directory: ~/.agents/skills\n  skillEnabled: {}\n",
  );
  writePrompts(settingsDir, "test", "use skills");
  withAppDataRoot(appData, () => {
    const settings = loadSettings(root);
    mkdirSync(settings.paths.dataDir, { recursive: true });
    expect(settings.paths.dataDir).toBe(resolve(appDataRoot(), "omity-agent"));
    expect(settings.model.reasoning_effort).toBe("medium");
    expect(settings.toolOutput.maxTokens).toBe(8192);
    expect(settings.agent.systemPrompt).toBe("test");
    expect(settings.skills.usagePrompt).toBe("use skills");
    expect(sessionPaths(settings, "abc/def").dir).toContain(safeId("abc/def"));
  });
});

test("prompt files expand current working directory placeholder", () => {
  const root = mkdtempSync(join(tmpdir(), "agent-config-"));
  const settingsDir = join(root, "settings");
  dirs.push(root);
  mkdirSync(settingsDir);
  writeFileSync(
    join(settingsDir, "main.yaml"),
    "paths:\n  dataDir: ./data\nmodel:\n  provider: openai-compatible\n  api: completions\n  model: test\n  apiKeyEnv: TEST_KEY\n  baseURL: null\n  maxRetries: 0\n  timeoutMs: 1000\nhost:\n  pollMs: 1\n  pausePollMs: 1\n  idleLogMs: 1\n  recursionLimit: 1\nlogging:\n  level: debug\n  streamTokens: false\ntoolOutput:\n  maxTokens: 8192\nskills:\n  enabled: false\n  directory: ~/.agents/skills\n  skillEnabled: {}\n",
  );
  writePrompts(settingsDir, "workspace: ${cwd}", "skills from ${cwd}");

  const settings = loadSettings(root);

  expect(settings.agent.systemPrompt).toBe(`workspace: ${root}`);
  expect(settings.skills.usagePrompt).toBe(`skills from ${root}`);
});

function writePrompts(
  settingsDir: string,
  systemPrompt: string,
  skillsPrompt: string,
) {
  const promptsDir = join(settingsDir, "prompts");
  mkdirSync(promptsDir);
  writeFileSync(join(promptsDir, "system.md"), systemPrompt);
  writeFileSync(join(promptsDir, "skills.md"), skillsPrompt);
}

function withAppDataRoot(path: string, callback: () => void) {
  const previous = {
    APPDATA: process.env["APPDATA"],
    HOME: process.env["HOME"],
    XDG_DATA_HOME: process.env["XDG_DATA_HOME"],
  };
  process.env["APPDATA"] = path;
  process.env["HOME"] = path;
  process.env["XDG_DATA_HOME"] = path;
  try {
    callback();
  } finally {
    restoreEnv("APPDATA", previous.APPDATA);
    restoreEnv("HOME", previous.HOME);
    restoreEnv("XDG_DATA_HOME", previous.XDG_DATA_HOME);
  }
}

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name];
    return;
  }
  process.env[name] = value;
}
