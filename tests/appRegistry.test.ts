import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Database } from "bun:sqlite";
import { afterEach, expect, test } from "bun:test";
import { AppRegistry } from "../src/app/registry";
import { loadSettings, sessionPaths } from "../src/infrastructure/config";
import { AgentDatabase } from "../src/infrastructure/database";

const dirs: string[] = [];
const consoleErrors: string[] = [];
const originalConsoleError = console.error;

afterEach(() => {
  console.error = originalConsoleError;
  consoleErrors.length = 0;
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("app registry lists sessions by scanning session databases", () => {
  const root = makeRoot();
  const workspace = join(root, "workspace");
  mkdirSync(workspace);
  const settings = loadSettings(root);
  const paths = sessionPaths(settings, "cli-session");
  const db = new AgentDatabase(paths.appDb);
  db.createSession("cli-session", workspace);
  db.close();

  const registry = new AppRegistry(root);

  expect(registry.list()).toEqual([
    {
      id: "cli-session",
      workspace,
      createdAt: expect.any(Number),
      updatedAt: expect.any(Number),
    },
  ]);
  expect(existsSync(join(settings.paths.dataDir, "app.sqlite"))).toBe(false);
});

test("app registry reports session databases without workspace column", () => {
  console.error = (message?: unknown) => {
    consoleErrors.push(String(message));
  };
  const root = makeRoot();
  const settings = loadSettings(root);
  const paths = sessionPaths(settings, "legacy-session");
  const db = new Database(paths.appDb, { create: true, strict: true });
  db.run(`
    CREATE TABLE sessions (
      id TEXT PRIMARY KEY,
      control TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);
  db.query(
    "INSERT INTO sessions (id, control, status, created_at, updated_at) VALUES (?, 'running', 'idle', 1, 2)",
  ).run("legacy-session");
  db.close();

  const registry = new AppRegistry(root);

  expect(() => registry.list()).toThrow(
    "数据库结构错误：sessions 表缺少列：workspace",
  );
  expect(consoleErrors[0]).toContain(
    `无法读取会话数据库 ${paths.appDb}：数据库结构错误：sessions 表缺少列：workspace`,
  );
});

function makeRoot() {
  const root = mkdtempSync(join(tmpdir(), "agent-registry-"));
  dirs.push(root);
  const settingsDir = join(root, "settings");
  mkdirSync(settingsDir);
  writeFileSync(
    join(settingsDir, "main.yaml"),
    "paths:\n  dataDir: ./data\nmodel:\n  provider: openai-compatible\n  api: completions\n  model: test\n  apiKeyEnv: TEST_KEY\n  baseURL: null\n  temperature: 0\n  maxRetries: 0\n  timeoutMs: 1000\nhost:\n  pollMs: 1\n  pausePollMs: 1\n  idleLogMs: 1\n  recursionLimit: 1\nlogging:\n  level: debug\n  streamTokens: false\ntoolOutput:\n  maxTokens: 8192\nskills:\n  enabled: false\n  directory: ~/.agents/skills\n  skillEnabled: {}\n",
  );
  const promptsDir = join(settingsDir, "prompts");
  writeFileSync(join(settingsDir, "hooks.yaml"), "hooks: []\n");
  mkdirSync(promptsDir);
  writeFileSync(join(promptsDir, "system.md"), "test");
  writeFileSync(join(promptsDir, "skills.md"), "use skills");
  return root;
}
