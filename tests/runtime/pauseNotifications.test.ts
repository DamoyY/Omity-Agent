import { afterEach, expect, test } from "bun:test";
import { cleanupDatabaseDirs, makeDb, required, workspace } from "../support/database";
import type { HostContext } from "../../src/runtime/context";
import { Logger } from "../../src/infrastructure/logging/logger";
import { processQueue } from "../../src/runtime/queue";
afterEach(cleanupDatabaseDirs);
test("paused polling publishes the state only once", async () => {
  const db = makeDb();
  db.resetSession("123", workspace);
  db.appendUser("123", "暂停中的输入");
  db.setControl("123", "pause");
  const item = required(db.nextQueue("123"));
  const controller = new AbortController();
  let changes = 0;
  const context = {
    checkpointer: {},
    controller,
    db,
    graph: {},
    logger: new Logger("error"),
    observer: {
      changed: () => {
        changes += 1;
      },
      token: () => undefined,
    },
    sessionId: "123",
    settings: { host: { pausePollMs: 1 } },
  } as unknown as HostContext;
  const running = processQueue(context, item);
  await Bun.sleep(10);
  expect(changes).toBe(1);
  controller.abort();
  await running;
  db.close();
});
