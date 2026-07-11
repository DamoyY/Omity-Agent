import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AIMessage } from "@langchain/core/messages";
import { fakeModel } from "@langchain/core/testing";
import { tool, type StructuredToolInterface } from "@langchain/core/tools";
import { MemorySaver } from "@langchain/langgraph-checkpoint";
import { z } from "zod";
import { expect, test } from "bun:test";
import { createAgentGraph } from "../../src/agent";
import { HookLedger } from "../../src/hooks/ledger";
import { HookRuntime } from "../../src/hooks/runtime";
import { AgentDatabase } from "../../src/infrastructure/database";
import { Logger } from "../../src/infrastructure/logger";
import { processQueue } from "../../src/runtime/queue";
import type { HostContext } from "../../src/runtime/context";
import { required } from "../support/database";
import { testLeaseOptions } from "../support/leases";
import { testSettings } from "../support/settings";

test("host restart resumes after one committed hook boundary", async () => {
  const dir = mkdtempSync(join(tmpdir(), "agent-hook-pause-"));
  const db = new AgentDatabase(join(dir, "app.sqlite"));
  const ledgers: HookLedger[] = [];
  let hookCalls = 0;
  const received: unknown[] = [];
  try {
    db.createSession("session", dir);
    db.appendUser("session", "hello");
    const hookTool = tool(
      ({ previous }) => {
        hookCalls++;
        received.push(previous);
        if (hookCalls === 1) db.setControl("session", "pause");
        return Promise.resolve("ok");
      },
      {
        name: "hook",
        description: "hook",
        schema: z.object({ previous: z.unknown().optional() }).strict(),
      },
    );
    const checkpointer = new MemorySaver();
    const firstLedger = new HookLedger(
      join(dir, "hooks.sqlite"),
      testLeaseOptions,
    );
    ledgers.push(firstLedger);
    const firstHooks = runtime(firstLedger, hookTool, dir);
    const firstGraph = createAgentGraph({
      settings: testSettings(dir),
      model: fakeModel(),
      tools: [hookTool],
      hooks: firstHooks,
      checkpointer,
    });
    const firstContext = makeContext(db, firstGraph, checkpointer, dir);
    firstContext.wake = () => {
      firstContext.controller.abort(new Error("test host restart"));
      return Promise.resolve();
    };

    await processQueue(firstContext, required(db.nextQueue("session")));

    expect(hookCalls).toBe(1);
    expect(received).toEqual([undefined]);
    expect(db.nextQueue("session")?.status).toBe("paused");
    const checkpoint = await firstGraph.getState({
      configurable: { thread_id: "session:1" },
    });
    expect(checkpoint.next).toEqual(["hooks"]);
    expect(checkpoint.values).toMatchObject({
      hookPlan: { kind: "agent", hookIndex: 1 },
    });
    expect(db.history("session").map((message) => message.type)).toEqual([
      "human",
      "ai",
      "tool",
    ]);
    firstLedger.close();
    ledgers.splice(ledgers.indexOf(firstLedger), 1);

    const recoveredLedger = new HookLedger(
      join(dir, "hooks.sqlite"),
      testLeaseOptions,
    );
    ledgers.push(recoveredLedger);
    const recoveredHooks = runtime(recoveredLedger, hookTool, dir);
    const recoveredGraph = createAgentGraph({
      settings: testSettings(dir),
      model: fakeModel().respond(new AIMessage("done")),
      tools: [hookTool],
      hooks: recoveredHooks,
      checkpointer,
    });
    db.setControl("session", "running");
    await processQueue(
      makeContext(db, recoveredGraph, checkpointer, dir),
      required(db.nextQueue("session")),
    );

    expect(hookCalls).toBe(2);
    expect(received).toEqual([undefined, "ok"]);
    expect(db.nextQueue("session")).toBeNull();
    expect(db.history("session").map((message) => message.type)).toEqual([
      "human",
      "ai",
      "tool",
      "ai",
    ]);
  } finally {
    for (const ledger of ledgers) ledger.close();
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

function runtime(
  ledger: HookLedger,
  hookTool: StructuredToolInterface,
  dir: string,
) {
  return new HookRuntime(
    [
      {
        id: "user-first",
        target: "agent",
        when: "before",
        runLimit: -1,
        mode: "takeover",
        tool: "hook",
        args: {},
      },
      {
        id: "user-second",
        target: "agent",
        when: "before",
        runLimit: -1,
        mode: "silent",
        tool: "hook",
        args: { previous: "${previousTool.output}" },
      },
    ],
    [hookTool],
    ledger,
    new Logger("error", true),
    "session",
    dir,
  );
}

function makeContext(
  db: AgentDatabase,
  graph: unknown,
  checkpointer: MemorySaver,
  dataDir: string,
): HostContext {
  return {
    settings: testSettings(dataDir),
    logger: new Logger("error", true),
    db,
    graph: graph as HostContext["graph"],
    checkpointer: checkpointer as never,
    inputNode: "hooks",
    sessionId: "session",
    controller: new AbortController(),
    wake: (delayMs) => Bun.sleep(delayMs),
  };
}
