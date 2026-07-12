import { AIMessage } from "@langchain/core/messages";
import { fakeModel } from "@langchain/core/testing";
import { tool } from "@langchain/core/tools";
import { MemorySaver } from "@langchain/langgraph-checkpoint";
import { afterEach, expect, test } from "bun:test";
import { z } from "zod";
import { createAgentGraph } from "../../src/agent";
import { HookLedger } from "../../src/hooks/ledger";
import { HookRuntime } from "../../src/hooks/runtime";
import { AgentDatabase } from "../../src/infrastructure/database/agentDatabase";
import { Logger } from "../../src/infrastructure/logging/logger";
import type { HostContext } from "../../src/runtime/context";
import { processQueue } from "../../src/runtime/queue";
import {
  cleanupDatabaseDirs,
  makeDb,
  required,
  workspace,
} from "../support/database";
import { testLeaseOptions } from "../support/leases";
import { testSettings } from "../support/settings";

afterEach(cleanupDatabaseDirs);

test("append during model execution continues after the agent boundary", async () => {
  const db = makeDb();
  db.resetSession("session", workspace);
  db.appendUser("session", "first");
  const ledger = new HookLedger(db.db, testLeaseOptions);
  let afterCalls = 0;
  const afterTool = tool(
    () => {
      afterCalls++;
      return Promise.resolve("notified");
    },
    { name: "notify", description: "notify", schema: z.object({}) },
  );
  const hooks = new HookRuntime(
    [
      {
        id: "after",
        target: "agent",
        when: "after",
        runLimit: -1,
        mode: "silent",
        tool: "notify",
        args: {},
      },
    ],
    [afterTool],
    ledger,
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
    settings: testSettings(workspace),
    model,
    tools: [afterTool],
    hooks,
    checkpointer,
  });
  try {
    await processQueue(
      context(db, graph, checkpointer),
      required(db.nextQueue("session")),
    );
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
  const ledger = new HookLedger(db.db, testLeaseOptions);
  let beforeCalls = 0;
  const beforeTool = tool(
    () => {
      beforeCalls++;
      if (beforeCalls === 1) db.appendUser("session", "second");
      return Promise.resolve("queued");
    },
    {
      name: "queue-next",
      description: "queue next input",
      schema: z.object({}),
    },
  );
  const hooks = new HookRuntime(
    [
      {
        id: "before",
        target: "agent",
        when: "before",
        runLimit: -1,
        mode: "silent",
        tool: "queue-next",
        args: {},
      },
    ],
    [beforeTool],
    ledger,
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
    settings: testSettings(workspace),
    model,
    tools: [beforeTool],
    hooks,
    checkpointer,
  });
  try {
    await processQueue(
      context(db, graph, checkpointer),
      required(db.nextQueue("session")),
    );
    expect(inputs).toEqual([["test", "first", "second"]]);
    expect(beforeCalls).toBe(2);
    expect(db.nextQueue("session")).toBeNull();
  } finally {
    db.close();
  }
});

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
