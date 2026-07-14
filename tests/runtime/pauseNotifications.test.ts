import { afterEach, expect, test } from "bun:test";
import { Logger } from "../../src/infrastructure/logging/logger";
import type { HostContext } from "../../src/runtime/context";
import { processQueue } from "../../src/runtime/queue";
import { cleanupDatabaseDirs, makeDb, required, workspace } from "../support/database";
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
    settings: { host: { pausePollMs: 1 } },
    logger: new Logger("error"),
    db,
    graph: {},
    checkpointer: {},
    sessionId: "123",
    controller,
    observer: {
      changed: () => {
        changes += 1;
      },
      token: () => undefined,
    },
  } as unknown as HostContext;
  const running = processQueue(context, item);
  await Bun.sleep(10);
  expect(changes).toBe(1);
  controller.abort();
  await running;
  db.close();
});
