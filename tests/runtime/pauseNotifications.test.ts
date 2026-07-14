import { afterEach, expect, test } from "bun:test";
import { cleanupDatabaseDirs, makeDb, required, workspace } from "../support/database";
import { BunSqliteSaver } from "../../src/checkpointer";
import { HookRuntime } from "../../src/hooks/runtime";
import type { HostContext } from "../../src/runtime/context";
import { Logger } from "../../src/infrastructure/logging/logger";
import { createAgentGraph } from "../../src/agent";
import { fakeModel } from "@langchain/core/testing";
import { processQueue } from "../../src/runtime/queue";
import { testSettings } from "../support/settings";

afterEach(cleanupDatabaseDirs);
test("paused polling publishes the state only once", async () => {
  const db = makeDb();
  db.resetSession("123", workspace);
  db.appendUser("123", "暂停中的输入");
  db.setControl("123", "pause");
  const item = required(db.nextQueue("123"));
  const controller = new AbortController();
  let changes = 0;
  const settings = testSettings(workspace);
  settings.host.pausePollMs = 1;
  const logger = new Logger("error");
  const checkpointer = new BunSqliteSaver(db.db, "123");
  const hooks = new HookRuntime([], [], db.db, logger, "123", workspace);
  const graph = createAgentGraph({ checkpointer, hooks, model: fakeModel(), settings, tools: [] });
  const context: HostContext = {
    checkpointer,
    controller,
    db,
    graph,
    logger,
    observer: {
      changed: () => {
        changes += 1;
      },
      token: () => undefined,
    },
    sessionId: "123",
    settings,
  };
  const running = processQueue(context, item);
  await Bun.sleep(10);
  expect(changes).toBe(1);
  controller.abort();
  await running;
  db.close();
});
