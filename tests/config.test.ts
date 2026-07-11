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
import { loadHookRules } from "../src/hooks/config";
import { resolveHookArgs } from "../src/hooks/variables";

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
  writeHooks(settingsDir);
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
  const workspace = join(root, "workspace");
  dirs.push(root);
  mkdirSync(settingsDir);
  mkdirSync(workspace);
  writeFileSync(
    join(settingsDir, "main.yaml"),
    "paths:\n  dataDir: ./data\nmodel:\n  provider: openai-compatible\n  api: completions\n  model: test\n  apiKeyEnv: TEST_KEY\n  baseURL: null\n  maxRetries: 0\n  timeoutMs: 1000\nhost:\n  pollMs: 1\n  pausePollMs: 1\n  idleLogMs: 1\n  recursionLimit: 1\nlogging:\n  level: debug\n  streamTokens: false\ntoolOutput:\n  maxTokens: 8192\nskills:\n  enabled: false\n  directory: ~/.agents/skills\n  skillEnabled: {}\n",
  );
  writePrompts(settingsDir, "workspace: ${cwd}", "skills from ${cwd}");
  writeHooks(settingsDir);

  const settings = loadSettings(root, { cwd: workspace });

  expect(settings.paths.dataDir).toBe(resolve(root, "data"));
  expect(settings.agent.systemPrompt).toBe(`workspace: ${workspace}`);
  expect(settings.skills.usagePrompt).toBe(`skills from ${workspace}`);
});

test("hook config parses targets and timing and rejects agent after takeover", () => {
  const root = mkdtempSync(join(tmpdir(), "agent-hooks-config-"));
  const path = join(root, "hooks.yaml");
  dirs.push(root);
  writeFileSync(
    path,
    `hooks:
  - id: user
    target: agent
    when: before
    mode: takeover
    tool: format
    args: { path: . }
  - id: end
    target: agent
    when: after
    mode: silent
    tool: notify
    args: {}
  - id: before
    target: write
    when: before
    mode: silent
    tool: lint
    args: {}
  - id: after
    target: write
    when: after
    mode: takeover
    tool: verify
    args: {}
`,
  );

  expect(loadHookRules(path).map(({ target, when }) => [target, when])).toEqual(
    [
      ["agent", "before"],
      ["agent", "after"],
      ["write", "before"],
      ["write", "after"],
    ],
  );
  writeFileSync(
    path,
    "hooks:\n  - id: invalid\n    target: agent\n    when: after\n    mode: takeover\n    tool: notify\n    args: {}\n",
  );
  expect(() => loadHookRules(path)).toThrow(
    "agent after Hook 仅支持 silent 模式",
  );
});

test("hook config rejects removed on and matchTool fields", () => {
  const root = mkdtempSync(join(tmpdir(), "agent-hooks-config-"));
  const path = join(root, "hooks.yaml");
  dirs.push(root);
  writeFileSync(
    path,
    "hooks:\n  - id: legacy\n    on: tool_before\n    target: write\n    when: before\n    mode: silent\n    tool: lint\n    args: {}\n    matchTool: write\n",
  );

  expect(() => loadHookRules(path)).toThrow();
});

test("hook variables preserve exact values and reject ambiguous output", () => {
  const previous = { files: ["a.ts", "b.ts"] };
  expect(
    resolveHookArgs(
      { exact: "${previousTool.output}", cwd: "${cwd}/src" },
      { cwd: "F:\\work", previousTool: { output: previous } },
    ),
  ).toEqual({ exact: previous, cwd: "F:\\work/src" });
  expect(() =>
    resolveHookArgs(
      { invalid: "result=${previousTool.output}" },
      { cwd: "F:\\work", previousTool: { output: previous } },
    ),
  ).toThrow("不能将数组或对象嵌入字符串");
  expect(() =>
    resolveHookArgs({ missing: "${previousTool.output}" }, { cwd: "F:\\work" }),
  ).toThrow("没有可用的前序工具输出");
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

function writeHooks(settingsDir: string) {
  writeFileSync(join(settingsDir, "hooks.yaml"), "hooks: []\n");
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
