import { AIMessage, type BaseMessage } from "@langchain/core/messages";
import { expect, spyOn, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { AgentDatabase } from "../../../src/infrastructure/database/agentDatabase";
import { BunSqliteSaver } from "../../../src/checkpointer";
import { HookRuntime } from "../../../src/hooks/runtime";
import type { HostContext } from "../../../src/runtime/context";
import { Logger } from "../../../src/infrastructure/logging/logger";
import { createAgentGraph } from "../../../src/agent";
import { fakeModel } from "@langchain/core/testing";
import { join } from "node:path";
import { processQueue } from "../../../src/runtime/queue";
import { queueMessageId } from "../../../src/infrastructure/database/records/messages/history";
import { required } from "../../support/database";
import { testSettings } from "../../support/settings";
import { tmpdir } from "node:os";

test("restart injects a consumed append missing from the checkpoint", async () => {
  const fixture = createFixture();
  let { db } = fixture;
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
  let { db } = fixture;
  try {
    db.createSession("session", fixture.dir);
    const firstId = db.appendUser("session", "first");
    db.startQueue("session", required(db.nextQueue("session")));
    const secondId = db.appendUser("session", "second");
    db.startQueue("session", required(db.pendingAppends("session")[0]));
    const initial = graph(db, fixture.dir, fakeModel());
    await commitModelBoundary(initial.graph, db.history("session"), [firstId, secondId]);
    db.close();
    db = new AgentDatabase(fixture.path);
    const recovered = graph(db, fixture.dir, fakeModel().respond(new AIMessage("done")));
    const inputs: unknown[] = [];
    const originalStream = recovered.graph.stream.bind(recovered.graph);
    spyOn(recovered.graph, "stream").mockImplementation((input, options) => {
      inputs.push(input);
      return originalStream(input, options);
    });
    await processQueue(
      context(db, recovered.graph, recovered.checkpointer, fixture.dir),
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
  const hooks = new HookRuntime([], [], db.db, new Logger("error", true), "session", dir);
  return {
    checkpointer,
    graph: createAgentGraph({
      checkpointer,
      hooks,
      model,
      settings: testSettings(dir),
      tools: [],
    }),
  };
}
async function commitModelBoundary(
  agentGraph: ReturnType<typeof createAgentGraph>,
  messages: BaseMessage[],
  queueIds: number[],
) {
  const stream = await agentGraph.stream(
    {
      hookPendingUserIds: queueIds.map((id) => queueMessageId("session", id)),
      messages,
    },
    {
      configurable: { thread_id: "session:1" },
      interruptBefore: ["model_request"],
    },
  );
  for await (const event of stream) {
    void event;
  }
  const state = await agentGraph.getState({ configurable: { thread_id: "session:1" } });
  expect(state.next).toEqual(["model_request"]);
}
function context(
  db: AgentDatabase,
  graphValue: ReturnType<typeof createAgentGraph>,
  checkpointer: BunSqliteSaver,
  dir: string,
): HostContext {
  return {
    checkpointer,
    controller: new AbortController(),
    db,
    graph: graphValue,
    logger: new Logger("error", true),
    sessionId: "session",
    settings: testSettings(dir),
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
  return { db: new AgentDatabase(path), dir, path };
}
function removeFixture(dir: string) {
  rmSync(dir, { force: true, recursive: true });
}
