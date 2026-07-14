import { randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "bun:test";
import { AppController } from "../../src/app/controller";
import { loadSettings } from "../../src/infrastructure/configuration/loadSettings";
import { sessionPaths } from "../../src/infrastructure/configuration/sessionPaths";
import { AgentDatabase } from "../../src/infrastructure/database/agentDatabase";
import { hostOwnerId } from "../../src/infrastructure/process/ownership";
import { recoverHostSession } from "../../src/runtime/execution/recovery";
import { required } from "../support/database";
import { writeTestConfiguration } from "../support/configuration";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

test("app startup atomically pauses an orphaned run", async () => {
  const fixture = interruptedSession("orphan");
  const pending = fixture.db.appendUser("orphan", "尚未消费的追加输入");
  fixture.db.close();

  const controller = new AppController(fixture.root);
  const transcript = controller.transcript("orphan");

  expect(controller.bootstrap().sessions[0]?.status).toBe("paused");
  expect(transcript.control).toBe("pause");
  expect(transcript.queue.map(({ id, status }) => ({ id, status }))).toEqual([
    { id: fixture.queueId, status: "paused" },
    { id: pending, status: "pending" },
  ]);
  await controller.close();
});

test("app startup reclaims the lease of its terminated predecessor", async () => {
  const fixture = interruptedSession("abandoned");
  const abandonedOwner = { pid: process.pid, token: randomUUID() };
  fixture.db.acquireHostLease({
    sessionId: "abandoned",
    ownerId: hostOwnerId({
      instanceId: abandonedOwner.token,
      kind: "app",
      pid: abandonedOwner.pid,
    }),
    now: Date.now(),
    ttlMs: 30_000,
  });
  fixture.db.close();

  const controller = new AppController(fixture.root, { abandonedOwner });
  const reopened = openSession(fixture.root, "abandoned");
  expect(reopened.control("abandoned")).toBe("pause");
  expect(reopened.queueStatus(fixture.queueId)).toBe("paused");
  expect(reopened.hostLease("abandoned")).toBeNull();
  reopened.close();
  await controller.close();
});

test("app startup never takes over a live standalone host", async () => {
  const fixture = interruptedSession("live");
  fixture.db.acquireHostLease({
    sessionId: "live",
    ownerId: hostOwnerId({
      instanceId: randomUUID(),
      kind: "standalone",
      pid: process.pid,
    }),
    now: Date.now(),
    ttlMs: 30_000,
  });
  fixture.db.close();

  const controller = new AppController(fixture.root);
  const reopened = openSession(fixture.root, "live");
  expect(reopened.control("live")).toBe("running");
  expect(reopened.queueStatus(fixture.queueId)).toBe("running");
  expect(reopened.hostLease("live")).not.toBeNull();
  reopened.close();
  await controller.close();
});

test("standalone Host uses the shared interrupted-session recovery", () => {
  const fixture = interruptedSession("standalone");
  fixture.db.acquireHostLease({
    sessionId: "standalone",
    ownerId: hostOwnerId({
      instanceId: randomUUID(),
      kind: "standalone",
      pid: process.pid,
    }),
    now: Date.now() - 1_000,
    ttlMs: 1,
  });
  expect(recoverHostSession(fixture.db, "standalone").status).toBe("recovered");
  expect(fixture.db.control("standalone")).toBe("pause");
  expect(fixture.db.queueStatus(fixture.queueId)).toBe("paused");
  fixture.db.close();
});

test("resume stays paused when Host initialization fails", async () => {
  const fixture = interruptedSession("resume-failure");
  fixture.db.close();
  writeFileSync(join(fixture.root, "settings", "mcp.yaml"), "[]\n");
  const controller = new AppController(fixture.root);

  const failure = await captureFailure(controller.control("resume-failure", "running"));
  expect(failure.message).toContain("MCP");

  const reopened = openSession(fixture.root, "resume-failure");
  expect(reopened.control("resume-failure")).toBe("pause");
  expect(reopened.queueStatus(fixture.queueId)).toBe("paused");
  reopened.close();
  await controller.close();
});

function interruptedSession(sessionId: string) {
  const root = mkdtempSync(join(tmpdir(), "agent-app-recovery-"));
  roots.push(root);
  writeTestConfiguration(root);
  const workspace = join(root, "workspace");
  mkdirSync(workspace);
  const db = openSession(root, sessionId);
  db.createSession(sessionId, workspace);
  const queueId = db.appendUser(sessionId, "运行中的输入");
  db.startQueue(sessionId, required(db.nextQueue(sessionId)));
  return { root, db, queueId };
}

function openSession(root: string, sessionId: string) {
  const settings = loadSettings(root);
  return new AgentDatabase(sessionPaths(settings, sessionId).dbPath);
}

async function captureFailure(promise: Promise<unknown>) {
  let failure: unknown;
  try {
    await promise;
  } catch (error) {
    failure = error;
  }
  expect(failure).toBeInstanceOf(Error);
  if (!(failure instanceof Error)) throw failure;
  return failure;
}
