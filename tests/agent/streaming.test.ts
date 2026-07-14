import { AIMessageChunk, HumanMessage } from "@langchain/core/messages";
import { afterEach, expect, test } from "bun:test";
import { cleanupDatabaseDirs, makeDb, workspace } from "../support/database";
import { createStreamLogState, handleStreamEvent } from "../../src/runtime/stream";
import { BunSqliteSaver } from "../../src/checkpointer";
import { FakeStreamingChatModel } from "@langchain/core/utils/testing";
import { HookRuntime } from "../../src/hooks/runtime";
import type { HostContext } from "../../src/runtime/context";
import { Logger } from "../../src/infrastructure/logging/logger";
import { createAgentGraph } from "../../src/agent";
import { testSettings } from "../support/settings";
afterEach(cleanupDatabaseDirs);
test("streams every model delta once across the recoverable task boundary", async () => {
  const db = makeDb();
  db.resetSession("session", workspace);
  const queueId = db.appendUser("session", "开始");
  const logger = new Logger("error");
  const settings = testSettings(workspace);
  const model = new FakeStreamingChatModel({
    chunks: [
      new AIMessageChunk({
        additional_kwargs: {
          reasoning: {
            summary: [{ index: 0, text: "分析", type: "summary_text" }],
            type: "reasoning",
          },
        },
        content: [],
      }),
      new AIMessageChunk({ content: "重" }),
      new AIMessageChunk({ content: "重" }),
    ],
  });
  const hooks = new HookRuntime([], [], db.db, logger, "session", workspace);
  const checkpointer = new BunSqliteSaver(db.db, "session");
  const graph = createAgentGraph({
    checkpointer,
    hooks,
    model,
    settings,
    tools: [],
  });
  const tokens: string[] = [];
  const reasoning: string[] = [];
  db.onChange((event) => {
    if (event.kind === "assistant_reasoning_delta") {
      reasoning.push(event.value);
    }
    if (event.kind === "assistant_text_delta") {
      tokens.push(event.value);
    }
  });
  const context: HostContext = {
    checkpointer,
    controller: new AbortController(),
    db,
    graph,
    logger,
    sessionId: "session",
    settings,
  };
  try {
    const stream = await graph.stream(
      { messages: [new HumanMessage("开始")] },
      {
        configurable: { thread_id: "session:1" },
        streamMode: ["messages", "updates", "debug"],
      },
    );
    const state = createStreamLogState();
    for await (const event of stream) {
      handleStreamEvent(context, event, state, queueId);
    }
    expect(reasoning).toEqual(["分析"]);
    expect(tokens).toEqual(["重", "重"]);
  } finally {
    db.close();
  }
});
