import { type StructuredToolInterface, tool } from "@langchain/core/tools";
import { expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { AIMessage } from "@langchain/core/messages";
import { AgentDatabase } from "../../src/infrastructure/database/agentDatabase";
import { BunSqliteSaver } from "../../src/checkpointer";
import { HookRuntime } from "../../src/hooks/runtime";
import type { HostContext } from "../../src/runtime/context";
import { Logger } from "../../src/infrastructure/logging/logger";
import { createAgentGraph } from "../../src/agent";
import { fakeModel } from "@langchain/core/testing";
import { join } from "node:path";
import { processQueue } from "../../src/runtime/queue";
import { required } from "../support/database";
import { testSettings } from "../support/settings";
import { tmpdir } from "node:os";
import { z } from "zod";
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
        if (hookCalls === 1) {
          db.setControl("session", "pause");
        }
        return Promise.resolve("ok");
      },
      {
        description: "hook",
        name: "hook",
        schema: z.object({ previous: z.unknown().optional() }).strict(),
      },
    );
    const checkpointer = new BunSqliteSaver(db.db, "session");
    const firstHooks = runtime(db, hookTool, dir);
    const firstGraph = createAgentGraph({
      checkpointer,
      hooks: firstHooks,
      model: fakeModel(),
      settings: testSettings(dir),
      tools: [hookTool],
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
      hookPlan: { hookIndex: 1, kind: "agent" },
    });
    expect(db.history("session").map((message) => message.type)).toEqual(["human", "ai", "tool"]);
    db.close();
    db = new AgentDatabase(path);
    const recoveredHooks = runtime(db, hookTool, dir);
    const recoveredCheckpointer = new BunSqliteSaver(db.db, "session");
    const recoveredGraph = createAgentGraph({
      checkpointer: recoveredCheckpointer,
      hooks: recoveredHooks,
      model: fakeModel().respond(new AIMessage("done")),
      settings: testSettings(dir),
      tools: [hookTool],
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
    let removed = false;
    try {
      rmSync(dir, { force: true, recursive: true });
      removed = true;
    } catch (error) {
      if (
        !(error instanceof Error && "code" in error && error.code === "EBUSY") ||
        attempt === 49
      ) {
        throw error;
      }
    }
    if (removed) {
      return;
    }
    await Bun.sleep(50);
  }
}
function runtime(db: AgentDatabase, hookTool: StructuredToolInterface, dir: string) {
  return new HookRuntime(
    [
      {
        args: {},
        id: "user-first",
        mode: "takeover",
        runLimit: -1,
        target: "agent",
        tool: "hook",
        when: "before",
      },
      {
        args: { previous: `\${previousTool.output}` },
        id: "user-second",
        mode: "silent",
        runLimit: -1,
        target: "agent",
        tool: "hook",
        when: "before",
      },
    ],
    [hookTool],
    db.db,
    new Logger("error", true),
    "session",
    dir,
  );
}
function makeContext(
  db: AgentDatabase,
  graph: HostContext["graph"],
  checkpointer: BunSqliteSaver,
  dataDir: string,
): HostContext {
  return {
    checkpointer,
    controller: new AbortController(),
    db,
    graph,
    logger: new Logger("error", true),
    sessionId: "session",
    settings: testSettings(dataDir),
    wake: (delayMs) => Bun.sleep(delayMs),
  };
}
