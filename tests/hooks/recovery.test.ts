import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AIMessage } from "@langchain/core/messages";
import { fakeModel } from "@langchain/core/testing";
import { tool, type StructuredToolInterface } from "@langchain/core/tools";
import { z } from "zod";
import { expect, test } from "bun:test";
import { createAgentGraph } from "../../src/agent";
import { BunSqliteSaver } from "../../src/checkpointer";
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
  const path = join(dir, "agent.sqlite");
  let db = new AgentDatabase(path);
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
    const checkpointer = new BunSqliteSaver(db.db, "session");
    const firstLedger = new HookLedger(db.db, testLeaseOptions);
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
    db.close();
    db = new AgentDatabase(path);
    const recoveredLedger = new HookLedger(db.db, testLeaseOptions);
    const recoveredHooks = runtime(recoveredLedger, hookTool, dir);
    const recoveredCheckpointer = new BunSqliteSaver(db.db, "session");
    const recoveredGraph = createAgentGraph({
      settings: testSettings(dir),
      model: fakeModel().respond(new AIMessage("done")),
      tools: [hookTool],
      hooks: recoveredHooks,
      checkpointer: recoveredCheckpointer,
    });
    db.setControl("session", "running");
    await processQueue(
      makeContext(db, recoveredGraph, recoveredCheckpointer, dir),
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
    db.close();
    await removeDirectory(dir);
  }
});

async function removeDirectory(dir: string) {
  for (let attempt = 0; ; attempt++) {
    try {
      rmSync(dir, { recursive: true, force: true });
      return;
    } catch (error) {
      if (
        !(
          error instanceof Error &&
          "code" in error &&
          error.code === "EBUSY"
        ) ||
        attempt === 49
      ) {
        throw error;
      }
      await Bun.sleep(50);
    }
  }
}

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
  checkpointer: BunSqliteSaver,
  dataDir: string,
): HostContext {
  return {
    settings: testSettings(dataDir),
    logger: new Logger("error", true),
    db,
    graph: graph as HostContext["graph"],
    checkpointer: checkpointer,
    sessionId: "session",
    controller: new AbortController(),
    wake: (delayMs) => Bun.sleep(delayMs),
  };
}
