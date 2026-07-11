import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "bun:test";
import { parseClientIntent, runClient } from "../../src/client";
import { loadSettings, sessionPaths } from "../../src/infrastructure/config";
import { AgentDatabase } from "../../src/infrastructure/database";

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("client intent parses messages and controls", () => {
  expect(parseClientIntent(["append=你好"])).toEqual({ append: "你好" });
  expect(parseClientIntent(["pause"])).toEqual({ control: "pause" });
  expect(parseClientIntent(["continue"])).toEqual({ control: "running" });
  expect(parseClientIntent(["resume"])).toEqual({ control: "running" });
  expect(parseClientIntent(["cancel"])).toEqual({ control: "cancel" });
});

test("client cancel during pause preserves pause state", () => {
  const { dbPath, root } = makeSession("123");
  const db = new AgentDatabase(dbPath);
  db.setControl("123", "pause");
  db.close();

  runClient({ sessionId: "123", control: "cancel" }, root);

  const reopened = new AgentDatabase(dbPath);
  expect(reopened.control("123")).toBe("pause_cancel");
  reopened.close();
});

function makeSession(sessionId: string) {
  const root = mkdtempSync(join(tmpdir(), "agent-client-"));
  const settingsDir = join(root, "settings");
  dirs.push(root);
  mkdirSync(settingsDir);
  writeFileSync(
    join(settingsDir, "main.yaml"),
    "paths:\n  dataDir: ./data\nmodel:\n  provider: openai-compatible\n  api: completions\n  model: test\n  apiKeyEnv: TEST_KEY\n  baseURL: null\n  temperature: 0\n  maxRetries: 0\n  timeoutMs: 1000\nhost:\n  pollMs: 1\n  pausePollMs: 1\n  idleLogMs: 1\n  recursionLimit: 1\nlogging:\n  level: debug\n  streamTokens: false\ntoolOutput:\n  maxTokens: 8192\nskills:\n  enabled: false\n  directory: ~/.agents/skills\n  skillEnabled: {}\n",
  );
  writePrompts(settingsDir);
  writeFileSync(join(settingsDir, "hooks.yaml"), "hooks: []\n");
  const paths = sessionPaths(loadSettings(root), sessionId);
  const db = new AgentDatabase(paths.appDb);
  db.createSession(sessionId, root);
  db.close();
  return { dbPath: paths.appDb, root };
}

function writePrompts(settingsDir: string) {
  const promptsDir = join(settingsDir, "prompts");
  mkdirSync(promptsDir);
  writeFileSync(join(promptsDir, "system.md"), "test");
  writeFileSync(join(promptsDir, "skills.md"), "use skills");
}
