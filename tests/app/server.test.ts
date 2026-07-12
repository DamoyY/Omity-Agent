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
import { DomainError, sessionNotFound } from "../../src/errors";
import {
  controlBody,
  decodeSessionId,
  messageBody,
  readJson,
  requestBodyLimit,
} from "../../src/app/http/request";
import { AppRegistry } from "../../src/app/registry";
import { AppController } from "../../src/app/controller";
import {
  resolveSessionState,
  resolveSessionStatus,
} from "../../src/app/sessionState";
import { loadSettings } from "../../src/infrastructure/configuration/loadSettings";
import { sessionPaths } from "../../src/infrastructure/configuration/sessionPaths";
import { AgentDatabase } from "../../src/infrastructure/database/agentDatabase";
import { captureError } from "../../src/failures/details";
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
  expect(normalizeError(sessionNotFound("123"))).toMatchObject({
    status: 404,
    code: "SESSION_NOT_FOUND",
  });
  expect(
    normalizeError(
      new DomainError("HOST_LEASE_CONFLICT", "会话已有 Host 正在运行：123"),
    ),
  ).toMatchObject({
    status: 409,
    code: "HOST_LEASE_CONFLICT",
  });
  expect(
    normalizeError(new Error("会话不存在：文案不再参与映射")),
  ).toMatchObject({
    status: 500,
    code: "INTERNAL_ERROR",
    message: "会话不存在：文案不再参与映射",
  });
});

test("app session summaries expose paused queue errors", async () => {
  const root = makeRoot();
  const workspace = join(root, "workspace");
  mkdirSync(workspace);
  const paths = sessionPaths(loadSettings(root), "failed-session");
  const db = new AgentDatabase(paths.dbPath);
  db.createSession("failed-session", workspace);
  const queueId = db.appendUser("failed-session", "test");
  db.setQueueStatus(
    queueId,
    "paused",
    captureError(new Error("model request failed")),
  );
  db.close();

  const controller = new AppController(root);
  expect(controller.bootstrap().sessions[0]).toMatchObject({
    id: "failed-session",
    status: "error",
    error: { name: "Error", message: "model request failed" },
  });
  await controller.close();
});

test("app registry scans session databases without creating a global db", () => {
  const root = makeRoot();
  const workspace = join(root, "workspace");
  mkdirSync(workspace);
  const settings = loadSettings(root);
  const paths = sessionPaths(settings, "cli-session");
  const db = new AgentDatabase(paths.dbPath);
  db.createSession("cli-session", workspace);
  db.close();

  const sessions = new AppRegistry(settings).list();
  expect(sessions).toHaveLength(1);
  const session = required(sessions[0]);
  expect(session.id).toBe("cli-session");
  expect(session.workspace).toBe(workspace);
  expect(typeof session.createdAt).toBe("number");
  expect(typeof session.updatedAt).toBe("number");
  expect(existsSync(join(settings.paths.dataDir, "app.sqlite"))).toBe(false);
});

test("session status prioritizes errors and pauses over host activity", () => {
  const running = { control: "running" as const, paused: false, error: null };
  const failure = captureError(new Error("Run failed"));
  expect(resolveSessionStatus(running, "model", null)).toBe("model");
  expect(resolveSessionStatus(running, "tool", failure)).toBe("error");
  expect(resolveSessionStatus({ ...running, paused: true }, "tool", null)).toBe(
    "paused",
  );
  expect(
    resolveSessionStatus({ ...running, error: failure }, "model", null),
  ).toBe("error");
});

test("session state exposes host errors before queue errors", () => {
  const runError = captureError(new Error("Run failed"));
  const hostError = captureError(new Error("Host failed"));
  const session = {
    control: "running" as const,
    paused: true,
    error: runError,
  };
  expect(resolveSessionState(session, "model", hostError)).toEqual({
    status: "error",
    error: hostError,
  });
  expect(resolveSessionState(session, "model", null)).toEqual({
    status: "error",
    error: runError,
  });
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
    "paths:\n  dataDir: ./data\nmodel:\n  provider: openai-compatible\n  api: completions\n  model: test\n  apiKeyEnv: TEST_KEY\n  baseURL: null\n  temperature: 0\n  maxRetries: 0\n  timeoutMs: 1000\nhost:\n  pollMs: 1\n  pausePollMs: 1\n  idleLogMs: 1\n  recursionLimit: 1\nlogging:\n  level: debug\n  streamTokens: false\nleases:\n  hostTtlMs: 30000\n  hookTtlMs: 30000\ntoolOutput:\n  maxTokens: 8192\nskills:\n  enabled: false\n  directory: ~/.agents/skills\n  skillEnabled: {}\n",
  );
  writeFileSync(join(settingsDir, "hooks.yaml"), "hooks: []\n");
  writeFileSync(join(promptsDir, "system.md"), "test");
  writeFileSync(join(promptsDir, "skills.md"), "use skills");
  return root;
}
