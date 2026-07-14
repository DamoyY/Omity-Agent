import { AIMessage, type BaseMessage } from "@langchain/core/messages";
import { afterEach, expect, test } from "bun:test";
import { cleanupDatabaseDirs, makeDb, required, workspace } from "../support/database";
import type { AgentDatabase } from "../../src/infrastructure/database/agentDatabase";
import { BunSqliteSaver } from "../../src/checkpointer";
import { HookRuntime } from "../../src/hooks/runtime";
import type { HostContext } from "../../src/runtime/context";
import { Logger } from "../../src/infrastructure/logging/logger";
import { createAgentGraph } from "../../src/agent";
import { fakeModel } from "@langchain/core/testing";
import { processQueue } from "../../src/runtime/queue";
import { testSettings } from "../support/settings";

afterEach(cleanupDatabaseDirs);
test("restart completes every consumed queue item in the run", async () => {
  const db = pausedRunWithAppend();
  const messages = [...db.history("session"), new AIMessage({ content: "done", id: "final" })];
  await processQueue(
    context(db, terminalGraph(messages, "final")),
    required(db.nextQueue("session")),
  );
  expect(db.nextQueue("session")).toBeNull();
  db.close();
});
test("an empty final response cannot reuse a previous answer", async () => {
  const db = makeDb();
  db.resetSession("session", workspace);
  db.appendUser("session", "new question");
  const messages = [
    new AIMessage({ content: "old answer", id: "old" }),
    new AIMessage({ content: "", id: "current" }),
  ];
  await processQueue(
    context(db, terminalGraph(messages, "current")),
    required(db.nextQueue("session")),
  );
  expect(db.nextQueue("session")?.status).toBe("paused");
  db.close();
});
function pausedRunWithAppend() {
  const db = makeDb();
  db.resetSession("session", workspace);
  db.appendUser("session", "first");
  const first = required(db.nextQueue("session"));
  db.startQueue("session", first);
  db.appendUser("session", "second");
  const second = required(db.pendingAppends("session")[0]);
  db.startQueue("session", second);
  db.setQueueStatus(first.id, "paused");
  db.setQueueStatus(second.id, "paused");
  return db;
}
function terminalGraph(messages: BaseMessage[], finalMessageId: string) {
  return {
    getState: () =>
      Promise.resolve({
        next: [],
        tasks: [],
        values: {
          hookPlan: { finalMessageId, kind: "done" },
          messages,
        },
      }),
    stream: () => ({
      [Symbol.asyncIterator]() {
        return this;
      },
      next: () => Promise.resolve({ done: true as const, value: undefined }),
    }),
  };
}
function context(db: AgentDatabase, fixture: ReturnType<typeof terminalGraph>): HostContext {
  const settings = testSettings(workspace);
  const logger = new Logger("error", true);
  const checkpointer = new BunSqliteSaver(db.db, "session");
  const hooks = new HookRuntime([], [], db.db, logger, "session", workspace);
  const graph = Object.assign(
    createAgentGraph({ checkpointer, hooks, model: fakeModel(), settings, tools: [] }),
    fixture,
  );
  return {
    checkpointer,
    controller: new AbortController(),
    db,
    graph,
    logger,
    sessionId: "session",
    settings,
  };
}
