import { afterEach, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { resolveSessionState, resolveSessionStatus } from "../../src/app/sessionState";
import { AgentDatabase } from "../../src/infrastructure/database/agentDatabase";
import { AppController } from "../../src/app/controller";
import { AppInstanceLock } from "../../src/app/runtime/instanceLock";
import { AppRegistry } from "../../src/app/registry";
import { captureError } from "../../src/failures/details";
import { join } from "node:path";
import { loadSettings } from "../../src/infrastructure/configuration/loadSettings";
import { required } from "../support/database";
import { sessionPaths } from "../../src/infrastructure/configuration/sessionPaths";
import { tmpdir } from "node:os";
import { writeTestConfiguration } from "../support/configuration";

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { force: true, recursive: true });
  }
});
test("app session summaries expose paused queue errors", async () => {
  const root = makeRoot();
  const workspace = join(root, "workspace");
  mkdirSync(workspace);
  const paths = sessionPaths(loadSettings(root), "failed-session");
  const db = new AgentDatabase(paths.dbPath);
  db.createSession("failed-session", workspace);
  const queueId = db.appendUser("failed-session", "test");
  db.setQueueStatus(queueId, "paused", captureError(new Error("model request failed")));
  db.close();
  const controller = new AppController(root);
  expect(controller.bootstrap().sessions[0]).toMatchObject({
    error: { message: "model request failed", name: "Error" },
    id: "failed-session",
    status: "error",
  });
  await controller.close();
});
test("app registry serves a memory projection refreshed one session at a time", () => {
  const root = makeRoot();
  const workspace = join(root, "workspace");
  mkdirSync(workspace);
  const settings = loadSettings(root);
  const paths = sessionPaths(settings, "cli-session");
  const db = new AgentDatabase(paths.dbPath);
  db.createSession("cli-session", workspace);
  db.close();
  const registry = new AppRegistry(settings);
  const sessions = registry.list();
  expect(sessions).toHaveLength(1);
  const session = required(sessions[0]);
  expect(session.id).toBe("cli-session");
  expect(session.workspace).toBe(workspace);
  expect(typeof session.createdAt).toBe("number");
  expect(typeof session.updatedAt).toBe("number");
  const secondPaths = sessionPaths(settings, "second-session");
  const second = new AgentDatabase(secondPaths.dbPath);
  second.createSession("second-session", workspace);
  second.close();
  expect(registry.list()).toHaveLength(1);
  expect(registry.refresh("second-session").control).toBe("running");
  const changed = new AgentDatabase(secondPaths.dbPath);
  changed.setControl("second-session", "pause");
  changed.close();
  expect(registry.require("second-session").control).toBe("running");
  expect(registry.refresh("second-session").control).toBe("pause");
  rmSync(secondPaths.dir, { force: true, recursive: true });
  registry.remove("second-session");
  expect(() => registry.require("second-session")).toThrow("会话不存在");
  expect(existsSync(join(settings.paths.dataDir, "app.sqlite"))).toBe(false);
});
test("app instance lock rejects a second server for the same data directory", () => {
  const root = makeRoot();
  const { dataDir } = loadSettings(root).paths;
  const lock = AppInstanceLock.acquire(dataDir);
  expect(() => AppInstanceLock.acquire(dataDir)).toThrow("数据目录已有 App 在运行");
  lock.release();
  expect(existsSync(join(dataDir, "app.lock"))).toBe(false);
});
test("session status prioritizes errors and pauses over host activity", () => {
  const running = { control: "running" as const, error: null, paused: false };
  const failure = captureError(new Error("Run failed"));
  expect(resolveSessionStatus(running, "model", null)).toBe("model");
  expect(resolveSessionStatus(running, "tool", failure)).toBe("error");
  expect(resolveSessionStatus({ ...running, paused: true }, "tool", null)).toBe("paused");
  expect(resolveSessionStatus({ ...running, error: failure }, "model", null)).toBe("error");
});
test("session state exposes host errors before queue errors", () => {
  const runError = captureError(new Error("Run failed"));
  const hostError = captureError(new Error("Host failed"));
  const session = {
    control: "running" as const,
    error: runError,
    paused: true,
  };
  expect(resolveSessionState(session, "model", hostError)).toEqual({
    error: hostError,
    status: "error",
  });
  expect(resolveSessionState(session, "model", null)).toEqual({
    error: runError,
    status: "error",
  });
});
function makeRoot() {
  const root = mkdtempSync(join(tmpdir(), "agent-registry-"));
  dirs.push(root);
  writeTestConfiguration(root);
  return root;
}
