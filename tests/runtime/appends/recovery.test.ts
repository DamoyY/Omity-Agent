import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { BaseMessage } from "@langchain/core/messages";
import { AIMessage } from "@langchain/core/messages";
import { fakeModel } from "@langchain/core/testing";
import { expect, test } from "bun:test";
import { createAgentGraph } from "../../../src/agent";
import { BunSqliteSaver } from "../../../src/checkpointer";
import { HookRuntime } from "../../../src/hooks/runtime";
import { AgentDatabase } from "../../../src/infrastructure/database/agentDatabase";
import { queueMessageId } from "../../../src/infrastructure/database/records/messages/history";
import { Logger } from "../../../src/infrastructure/logging/logger";
import type { HostContext } from "../../../src/runtime/context";
import { processQueue } from "../../../src/runtime/queue";
import { required } from "../../support/database";
import { testSettings } from "../../support/settings";

test("restart injects a consumed append missing from the checkpoint", async () => {
  const fixture = createFixture();
  let db = fixture.db;
  try {
    db.createSession("session", fixture.dir);
    const firstId = db.appendUser("session", "first");
    db.startQueue("session", required(db.nextQueue("session")));
    const initial = graph(db, fixture.dir, fakeModel());
    await commitModelBoundary(initial.graph, db.history("session"), [firstId]);

    const secondId = db.appendUser("session", "second");
    db.startQueue("session", required(db.pendingAppends("session")[0]));
    db.close();

    db = new AgentDatabase(fixture.path);
    const modelInputs: string[][] = [];
    const recovered = graph(
      db,
      fixture.dir,
      fakeModel().respond((messages) => {
        modelInputs.push(humanContents(messages));
        return new AIMessage("done");
      }),
    );
    await processQueue(
      context(db, recovered.graph, recovered.checkpointer, fixture.dir),
      required(db.nextQueue("session")),
    );

    expect(modelInputs).toEqual([["first", "second"]]);
    expect(db.nextQueue("session")).toBeNull();
    expect(humanContents(db.history("session"))).toEqual(["first", "second"]);
    expect(secondId).toBeGreaterThan(firstId);
  } finally {
    db.close();
    removeFixture(fixture.dir);
  }
});

test("restart does not inject consumed messages already in the checkpoint", async () => {
  const fixture = createFixture();
  let db = fixture.db;
  try {
    db.createSession("session", fixture.dir);
    const firstId = db.appendUser("session", "first");
    db.startQueue("session", required(db.nextQueue("session")));
    const secondId = db.appendUser("session", "second");
    db.startQueue("session", required(db.pendingAppends("session")[0]));
    const initial = graph(db, fixture.dir, fakeModel());
    await commitModelBoundary(initial.graph, db.history("session"), [
      firstId,
      secondId,
    ]);
    db.close();

    db = new AgentDatabase(fixture.path);
    const recovered = graph(
      db,
      fixture.dir,
      fakeModel().respond(new AIMessage("done")),
    );
    const inputs: unknown[] = [];
    const observedGraph = {
      getState: recovered.graph.getState.bind(recovered.graph),
      stream: (input: unknown, options: unknown) => {
        inputs.push(input);
        return recovered.graph.stream(input as never, options as never);
      },
    };
    await processQueue(
      context(db, observedGraph, recovered.checkpointer, fixture.dir),
      required(db.nextQueue("session")),
    );

    expect(inputs[0]).toBeNull();
    expect(humanContents(db.history("session"))).toEqual(["first", "second"]);
  } finally {
    db.close();
    removeFixture(fixture.dir);
  }
});

function graph(
  db: AgentDatabase,
  dir: string,
  model: Parameters<typeof createAgentGraph>[0]["model"],
) {
  const checkpointer = new BunSqliteSaver(db.db, "session");
  const hooks = new HookRuntime(
    [],
    [],
    db.db,
    new Logger("error", true),
    "session",
    dir,
  );
  return {
    checkpointer,
    graph: createAgentGraph({
      settings: testSettings(dir),
      model,
      tools: [],
      hooks,
      checkpointer,
    }),
  };
}

async function commitModelBoundary(
  graph: ReturnType<typeof createAgentGraph>,
  messages: BaseMessage[],
  queueIds: number[],
) {
  const stream = await graph.stream(
    {
      messages,
      hookPendingUserIds: queueIds.map((id) => queueMessageId("session", id)),
    },
    {
      configurable: { thread_id: "session:1" },
      interruptBefore: ["model_request"],
    },
  );
  for await (const event of stream) void event;
  expect(
    (await graph.getState({ configurable: { thread_id: "session:1" } })).next,
  ).toEqual(["model_request"]);
}

function context(
  db: AgentDatabase,
  graph: unknown,
  checkpointer: BunSqliteSaver,
  dir: string,
): HostContext {
  return {
    settings: testSettings(dir),
    logger: new Logger("error", true),
    db,
    graph: graph as HostContext["graph"],
    checkpointer,
    sessionId: "session",
    controller: new AbortController(),
  };
}

function humanContents(messages: BaseMessage[]) {
  return messages
    .filter((message) => message.type === "human")
    .map((message) => {
      if (typeof message.content !== "string") {
        throw new Error("测试要求用户消息为纯文本");
      }
      return message.content;
    });
}

function createFixture() {
  const dir = mkdtempSync(join(tmpdir(), "agent-append-recovery-"));
  const path = join(dir, "agent.sqlite");
  return { dir, path, db: new AgentDatabase(path) };
}

function removeFixture(dir: string) {
  rmSync(dir, { recursive: true, force: true });
}
