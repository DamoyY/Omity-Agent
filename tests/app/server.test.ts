import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { afterEach, expect, test } from "bun:test";
import { normalizeError } from "../../src/app/http/errors";
import {
  controlBody,
  decodeSessionId,
  messageBody,
  readJson,
  requestBodyLimit,
} from "../../src/app/http/request";
import { AppRegistry } from "../../src/app/registry";
import { loadSettings, sessionPaths } from "../../src/infrastructure/config";
import { AgentDatabase } from "../../src/infrastructure/database";
import { required } from "../support/database";

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("API JSON validation rejects invalid controls and empty messages", async () => {
  await expectStatus(
    readJson(request({ control: "invalid" }), controlBody),
    400,
  );
  await expectStatus(readJson(request({ content: "   " }), messageBody), 400);
});

test("API JSON reader enforces the body size limit", async () => {
  const body = `"${"x".repeat(requestBodyLimit)}"`;
  await expectStatus(readJson(rawRequest(body), messageBody), 413);
});

test("API validates encoded session IDs without path normalization", () => {
  expect(decodeSessionId("web-123")).toBe("web-123");
  expect(() => decodeSessionId("abc%2Fdef")).toThrow("路径 ID 无效");
  expect(() => decodeSessionId("%E0%A4%A")).toThrow("Session ID 编码无效");
});

test("API maps missing sessions and conflicts to explicit status codes", () => {
  expect(normalizeError(new Error("会话不存在：123"))).toMatchObject({
    status: 404,
  });
  expect(
    normalizeError(new Error("会话已有 Host 正在运行：123")),
  ).toMatchObject({
    status: 409,
  });
});

test("app registry scans session databases without creating a global db", () => {
  const root = makeRoot();
  const workspace = join(root, "workspace");
  mkdirSync(workspace);
  const settings = loadSettings(root);
  const paths = sessionPaths(settings, "cli-session");
  const db = new AgentDatabase(paths.appDb);
  db.createSession("cli-session", workspace);
  db.close();

  const sessions = new AppRegistry(root).list();
  expect(sessions).toHaveLength(1);
  const session = required(sessions[0]);
  expect(session.id).toBe("cli-session");
  expect(session.workspace).toBe(workspace);
  expect(typeof session.createdAt).toBe("number");
  expect(typeof session.updatedAt).toBe("number");
  expect(existsSync(join(settings.paths.dataDir, "app.sqlite"))).toBe(false);
});

function request(body: unknown) {
  return rawRequest(JSON.stringify(body));
}

async function expectStatus(promise: Promise<unknown>, status: number) {
  try {
    await promise;
  } catch (error) {
    expect(error).toMatchObject({ status });
    return;
  }
  throw new Error(`请求应以状态 ${status.toString()} 失败`);
}

function rawRequest(body: string) {
  return Object.assign(Readable.from([Buffer.from(body, "utf8")]), {
    headers: {},
  }) as never;
}

function makeRoot() {
  const root = mkdtempSync(join(tmpdir(), "agent-registry-"));
  dirs.push(root);
  const settingsDir = join(root, "settings");
  const promptsDir = join(settingsDir, "prompts");
  mkdirSync(promptsDir, { recursive: true });
  writeFileSync(
    join(settingsDir, "main.yaml"),
    "paths:\n  dataDir: ./data\nmodel:\n  provider: openai-compatible\n  api: completions\n  model: test\n  apiKeyEnv: TEST_KEY\n  baseURL: null\n  temperature: 0\n  maxRetries: 0\n  timeoutMs: 1000\nhost:\n  pollMs: 1\n  pausePollMs: 1\n  idleLogMs: 1\n  recursionLimit: 1\nlogging:\n  level: debug\n  streamTokens: false\ntoolOutput:\n  maxTokens: 8192\nskills:\n  enabled: false\n  directory: ~/.agents/skills\n  skillEnabled: {}\n",
  );
  writeFileSync(join(settingsDir, "hooks.yaml"), "hooks: []\n");
  writeFileSync(join(promptsDir, "system.md"), "test");
  writeFileSync(join(promptsDir, "skills.md"), "use skills");
  return root;
}
