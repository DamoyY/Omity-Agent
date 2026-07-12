import { AIMessage, type BaseMessage } from "@langchain/core/messages";
import { MemorySaver } from "@langchain/langgraph-checkpoint";
import { afterEach, expect, test } from "bun:test";
import { AgentDatabase } from "../../src/infrastructure/database";
import { Logger } from "../../src/infrastructure/logger";
import type { HostContext } from "../../src/runtime/context";
import { processQueue } from "../../src/runtime/queue";
import {
  cleanupDatabaseDirs,
  makeDb,
  required,
  workspace,
} from "../support/database";
import { testSettings } from "../support/settings";

afterEach(cleanupDatabaseDirs);

test("restart completes every consumed queue item in the run", async () => {
  const db = pausedRunWithAppend();
  const messages = [
    ...db.history("session"),
    new AIMessage({ id: "final", content: "done" }),
  ];
  await processQueue(
    context(db, terminalGraph(messages, "final"), new MemorySaver()),
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
    new AIMessage({ id: "old", content: "old answer" }),
    new AIMessage({ id: "current", content: "" }),
  ];
  await processQueue(
    context(db, terminalGraph(messages, "current"), new MemorySaver()),
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
    stream: () => ({
      [Symbol.asyncIterator]() {
        return this;
      },
      next: () => Promise.resolve({ done: true as const, value: undefined }),
    }),
    getState: () =>
      Promise.resolve({
        values: {
          messages,
          hookPlan: { kind: "done", finalMessageId },
        },
        next: [],
        tasks: [],
      }),
  };
}

function context(
  db: AgentDatabase,
  graph: unknown,
  checkpointer: MemorySaver,
): HostContext {
  return {
    settings: testSettings(workspace),
    logger: new Logger("error", true),
    db,
    graph: graph as HostContext["graph"],
    checkpointer: checkpointer as never,
    sessionId: "session",
    controller: new AbortController(),
  };
}
