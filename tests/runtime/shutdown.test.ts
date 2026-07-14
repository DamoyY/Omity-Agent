import { afterEach, expect, test } from "bun:test";
import { AgentDatabase } from "../../src/infrastructure/database/agentDatabase";
import { Logger } from "../../src/infrastructure/logging/logger";
import type { HostContext } from "../../src/runtime/context";
import { HostLeaseLostError } from "../../src/runtime/execution/lease";
import { processQueue } from "../../src/runtime/queue";
import { cleanupDatabaseDirs, makeDb, required, workspace } from "../support/database";
import { testSettings } from "../support/settings";

afterEach(cleanupDatabaseDirs);

test("graceful stop waits for the active graph stream boundary", async () => {
  const db = runningDatabase();
  const started = Promise.withResolvers<undefined>();
  const release = Promise.withResolvers<undefined>();
  const graph = {
    async *stream(_input: unknown, options: { signal: AbortSignal }) {
      expect(options.signal.aborted).toBe(false);
      started.resolve(undefined);
      await release.promise;
      expect(options.signal.aborted).toBe(false);
      yield undefined;
    },
  };
  const stopping = new AbortController();
  const context = makeContext(db, graph, stopping.signal);
  const processing = processQueue(context, required(db.nextQueue("123")));
  await started.promise;

  stopping.abort(new Error("graceful stop"));
  expect(context.controller.signal.aborted).toBe(false);
  release.resolve(undefined);
  await processing;

  expect(db.nextQueue("123")?.status).toBe("paused");
  expect(db.control("123")).toBe("pause");
  db.close();
});

test("stop between queue status and claim cannot leave orphan running", async () => {
  const db = runningDatabase();
  const stopping = new AbortController();
  let changes = 0;
  const context = makeContext(
    db,
    { stream: () => Promise.reject(new Error("stream must not start")) },
    stopping.signal,
  );
  context.observer = {
    changed: () => {
      if (++changes === 1) stopping.abort(new Error("claim boundary stop"));
    },
    token: () => undefined,
  };

  await processQueue(context, required(db.nextQueue("123")));

  expect(db.nextQueue("123")?.status).toBe("paused");
  expect(db.control("123")).toBe("pause");
  expect(db.history("123")).toEqual([]);
  db.close();
});

test("wrapped abort cannot let a former lease owner pause the run", async () => {
  const db = runningDatabase();
  let leaseLost = false;
  const context = makeContext(
    db,
    {
      stream: () => {
        leaseLost = true;
        return Promise.reject(new Error("wrapped abort"));
      },
    },
    new AbortController().signal,
  );
  context.assertLease = () => {
    if (leaseLost) throw new HostLeaseLostError("lease lost");
  };

  let failure: unknown;
  try {
    await processQueue(context, required(db.nextQueue("123")));
  } catch (error) {
    failure = error;
  }
  expect(failure).toBeInstanceOf(HostLeaseLostError);
  expect(db.nextQueue("123")?.status).toBe("running");
  expect(db.control("123")).toBe("running");
  db.close();
});

function runningDatabase() {
  const db = makeDb();
  db.resetSession("123", workspace);
  db.appendUser("123", "需要恢复的输入");
  return db;
}

function makeContext(db: AgentDatabase, graph: unknown, stopping: AbortSignal): HostContext {
  return {
    settings: testSettings(workspace),
    logger: new Logger("error", true),
    db,
    graph: graph as HostContext["graph"],
    checkpointer: {
      getTuple: () => Promise.resolve(undefined),
    } as unknown as HostContext["checkpointer"],
    sessionId: "123",
    controller: new AbortController(),
    stopping,
  };
}
