import { afterEach, expect, test } from "bun:test";
import { cleanupDatabaseDirs, makeDb, required, workspace } from "../support/database";
import { AIMessage } from "@langchain/core/messages";
import type { AgentDatabase } from "../../src/infrastructure/database/agentDatabase";
import { HookRuntime } from "../../src/hooks/runtime";
import type { HostContext } from "../../src/runtime/context";
import { Logger } from "../../src/infrastructure/logging/logger";
import { MemorySaver } from "@langchain/langgraph-checkpoint";
import { createAgentGraph } from "../../src/agent";
import { fakeModel } from "@langchain/core/testing";
import { processQueue } from "../../src/runtime/queue";
import { testSettings } from "../support/settings";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
afterEach(cleanupDatabaseDirs);
test("append during model execution continues after the agent boundary", async () => {
  const db = makeDb();
  db.resetSession("session", workspace);
  db.appendUser("session", "first");
  let afterCalls = 0;
  const afterTool = tool(
    () => {
      afterCalls++;
      return Promise.resolve("notified");
    },
    { description: "notify", name: "notify", schema: z.object({}) },
  );
  const hooks = new HookRuntime(
    [
      {
        args: {},
        id: "after",
        mode: "silent",
        runLimit: -1,
        target: "agent",
        tool: "notify",
        when: "after",
      },
    ],
    [afterTool],
    db.db,
    new Logger("error", true),
    "session",
    workspace,
  );
  const model = fakeModel()
    .respond(() => {
      db.appendUser("session", "second");
      return new AIMessage("intermediate");
    })
    .respond((messages) => {
      expect(messages.map(({ content }) => content)).toEqual([
        "test",
        "first",
        "intermediate",
        "second",
      ]);
      return new AIMessage("final");
    });
  const checkpointer = new MemorySaver();
  const graph = createAgentGraph({
    checkpointer,
    hooks,
    model,
    settings: testSettings(workspace),
    tools: [afterTool],
  });
  try {
    await processQueue(context(db, graph, checkpointer), required(db.nextQueue("session")));
    expect(model.callCount).toBe(2);
    expect(afterCalls).toBe(1);
    expect(db.nextQueue("session")).toBeNull();
  } finally {
    db.close();
  }
});
test("append before a pending model replaces its scheduled route", async () => {
  const db = makeDb();
  db.resetSession("session", workspace);
  db.appendUser("session", "first");
  let beforeCalls = 0;
  const beforeTool = tool(
    () => {
      beforeCalls++;
      if (beforeCalls === 1) {
        db.appendUser("session", "second");
      }
      return Promise.resolve("queued");
    },
    {
      description: "queue next input",
      name: "queue-next",
      schema: z.object({}),
    },
  );
  const hooks = new HookRuntime(
    [
      {
        args: {},
        id: "before",
        mode: "silent",
        runLimit: -1,
        target: "agent",
        tool: "queue-next",
        when: "before",
      },
    ],
    [beforeTool],
    db.db,
    new Logger("error", true),
    "session",
    workspace,
  );
  const inputs: unknown[][] = [];
  const response = (messages: { content: unknown }[]) => {
    inputs.push(messages.map(({ content }) => content));
    return new AIMessage("final");
  };
  const model = fakeModel().respond(response).respond(response);
  const checkpointer = new MemorySaver();
  const graph = createAgentGraph({
    checkpointer,
    hooks,
    model,
    settings: testSettings(workspace),
    tools: [beforeTool],
  });
  try {
    await processQueue(context(db, graph, checkpointer), required(db.nextQueue("session")));
    expect(inputs).toEqual([["test", "first", "second"]]);
    expect(beforeCalls).toBe(2);
    expect(db.nextQueue("session")).toBeNull();
  } finally {
    db.close();
  }
});
function context(db: AgentDatabase, graph: unknown, checkpointer: MemorySaver): HostContext {
  return {
    checkpointer: checkpointer as never,
    controller: new AbortController(),
    db,
    graph: graph as HostContext["graph"],
    logger: new Logger("error", true),
    sessionId: "session",
    settings: testSettings(workspace),
  };
}
