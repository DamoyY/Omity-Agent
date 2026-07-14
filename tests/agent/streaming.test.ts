import { AIMessageChunk, HumanMessage } from "@langchain/core/messages";
import { afterEach, expect, test } from "bun:test";
import { cleanupDatabaseDirs, makeDb, workspace } from "../support/database";
import { createStreamLogState, handleStreamEvent } from "../../src/runtime/stream";
import { FakeStreamingChatModel } from "@langchain/core/utils/testing";
import { HookRuntime } from "../../src/hooks/runtime";
import { Logger } from "../../src/infrastructure/logging/logger";
import { createAgentGraph } from "../../src/agent";
import { testSettings } from "../support/settings";
afterEach(cleanupDatabaseDirs);
test("streams every model delta once across the recoverable task boundary", async () => {
  const db = makeDb();
  db.resetSession("session", workspace);
  const logger = new Logger("error");
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
  const graph = createAgentGraph({
    hooks,
    model,
    settings: testSettings(workspace),
    tools: [],
  });
  const tokens: string[] = [];
  const reasoning: string[] = [];
  const context = {
    db: {
      streamReasoning: (_sessionId: string, _queueId: number, text: string) => reasoning.push(text),
      streamToken: (_sessionId: string, _queueId: number, text: string) => tokens.push(text),
      streamToolCall: () => undefined,
    },
    logger,
    observer: { token: () => undefined },
    sessionId: "session",
    settings: testSettings(workspace),
  } as never;
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
      handleStreamEvent(context, event, state, 1);
    }
    expect(reasoning).toEqual(["分析"]);
    expect(tokens).toEqual(["重", "重"]);
  } finally {
    db.close();
  }
});
