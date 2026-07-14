import { afterEach, expect, test } from "bun:test";
import { join, resolve } from "node:path";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { safeId, sessionPaths } from "../../src/infrastructure/configuration/sessionPaths";
import { appDataRoot } from "../../src/infrastructure/configuration/configuredPath";
import { loadHookRules } from "../../src/infrastructure/configuration/hookRules";
import { loadSettings } from "../../src/infrastructure/configuration/loadSettings";
import { parseModelSettings } from "../../src/infrastructure/configuration/settingsSchema";
import { resolveHookArgs } from "../../src/hooks/variables";
import { tmpdir } from "node:os";
import { writeTestConfiguration } from "../support/configuration";

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { force: true, recursive: true });
  }
});
test("settings yaml resolves AppData data directory", () => {
  const root = mkdtempSync(join(tmpdir(), "agent-config-"));
  const appData = join(root, "app-data");
  dirs.push(root);
  writeTestConfiguration(root, {
    dataDir: `\${appData}/omity-agent`,
  });
  const restoreAppDataRoot = setAppDataRoot(appData);
  try {
    const settings = loadSettings(root);
    mkdirSync(settings.paths.dataDir, { recursive: true });
    expect(settings.paths.dataDir).toBe(resolve(appDataRoot(), "omity-agent"));
    expect(settings.model.reasoning_effort).toBe("medium");
    expect(settings.toolOutput.maxTokens).toBe(8192);
    expect(settings.agent.systemPrompt).toBe("test");
    expect(settings.skills.usagePrompt).toBe("use skills");
    const paths = sessionPaths(settings, "abc-def");
    expect(paths).toEqual({
      dbPath: resolve(settings.paths.dataDir, "sessions", safeId("abc-def"), "agent.sqlite"),
      dir: resolve(settings.paths.dataDir, "sessions", safeId("abc-def")),
    });
    expect(() => sessionPaths(settings, "abc/def")).toThrow("路径 ID 无效");
    expect(() => sessionPaths(settings, "abc:def")).toThrow("路径 ID 无效");
  } finally {
    restoreAppDataRoot();
  }
});
test("prompt files expand current working directory placeholder", () => {
  const root = mkdtempSync(join(tmpdir(), "agent-config-"));
  const workspace = join(root, "workspace");
  dirs.push(root);
  mkdirSync(workspace);
  writeTestConfiguration(root, {
    skillsPrompt: `skills from \${cwd}`,
    systemPrompt: `workspace: \${cwd}`,
  });
  const settings = loadSettings(root, { cwd: workspace });
  expect(settings.paths.dataDir).toBe(resolve(root, "data"));
  expect(settings.agent.systemPrompt).toBe(`workspace: ${workspace}`);
  expect(settings.skills.usagePrompt).toBe(`skills from ${workspace}`);
});
test("model yaml selects a named profile from multiple profiles", () => {
  const root = mkdtempSync(join(tmpdir(), "agent-config-"));
  dirs.push(root);
  writeTestConfiguration(root, {
    modelYaml: `profile: codex
profiles:
  gateway:
    adapter: completions
    model: gateway-model
    apiKeyEnv: TEST_KEY
    baseURL: null
    timeoutMs: 1000
  codex:
    adapter: codex
    model: codex-model
    timeoutMs: 2000
`,
  });
  expect(loadSettings(root).model).toEqual({
    adapter: "codex",
    model: "codex-model",
    timeoutMs: 2000,
  });
});
test("model yaml rejects an unknown profile", () => {
  expect(() => parseModelSettings({ profile: "missing", profiles: {} })).toThrow(
    "Profile 不存在：missing",
  );
});
test("hook config parses targets, timing, and modes", () => {
  const root = mkdtempSync(join(tmpdir(), "agent-hooks-config-"));
  const path = join(root, "hooks.yaml");
  dirs.push(root);
  writeFileSync(
    path,
    `hooks:
  - id: user
    target: agent
    when: before
    runLimit: -1
    mode: takeover
    tool: format
    args: { path: . }
  - id: end
    target: agent
    when: after
    runLimit: 1
    mode: takeover
    tool: notify
    args: {}
  - id: before
    target: write
    when: before
    runLimit: 0
    mode: silent
    tool: lint
    args: {}
  - id: after
    target: write
    when: after
    runLimit: 2
    mode: takeover
    tool: verify
    args: {}
`,
  );
  expect(loadHookRules(path).map(({ target, when, mode }) => [target, when, mode])).toEqual([
    ["agent", "before", "takeover"],
    ["agent", "after", "takeover"],
    ["write", "before", "silent"],
    ["write", "after", "takeover"],
  ]);
});
test("hook variables preserve exact values and reject ambiguous output", () => {
  const previous = { files: ["a.ts", "b.ts"] };
  expect(
    resolveHookArgs(
      { cwd: `\${cwd}/src`, exact: `\${previousTool.output}` },
      { cwd: "F:\\work", previousTool: { output: previous } },
    ),
  ).toEqual({ cwd: "F:\\work/src", exact: previous });
  expect(() =>
    resolveHookArgs(
      { invalid: `result=\${previousTool.output}` },
      { cwd: "F:\\work", previousTool: { output: previous } },
    ),
  ).toThrow("不能将数组或对象嵌入字符串");
  expect(() =>
    resolveHookArgs({ missing: `\${previousTool.output}` }, { cwd: "F:\\work" }),
  ).toThrow("没有可用的前序工具输出");
});
function setAppDataRoot(path: string) {
  const previous = {
    APPDATA: process.env["APPDATA"],
    HOME: process.env["HOME"],
    XDG_DATA_HOME: process.env["XDG_DATA_HOME"],
  };
  process.env["APPDATA"] = path;
  process.env["HOME"] = path;
  process.env["XDG_DATA_HOME"] = path;
  return () => {
    restoreEnv("APPDATA", previous.APPDATA);
    restoreEnv("HOME", previous.HOME);
    restoreEnv("XDG_DATA_HOME", previous.XDG_DATA_HOME);
  };
}
function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) {
    Reflect.deleteProperty(process.env, name);
    return;
  }
  process.env[name] = value;
}
