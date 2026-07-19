import {
  AIMessageChunk,
  type RawInputToolCallChunk,
  ToolMessageChunk,
} from "@langchain/core/messages";
import { afterEach, expect, spyOn, test } from "bun:test";
import { cleanupDatabaseDirs, makeDb, workspace } from "../support/database";
import {
  createStreamLogState,
  discardActiveStream,
  handleStreamEvent,
} from "../../src/runtime/stream";
import type { AgentDatabase } from "../../src/infrastructure/database/agentDatabase";
import { BunSqliteSaver } from "../../src/checkpointer";
import { HookRuntime } from "../../src/hooks/runtime";
import type { HostContext } from "../../src/runtime/context";
import { Logger } from "../../src/infrastructure/logging/logger";
import { createAgentGraph } from "../../src/agent";
import { fakeModel } from "@langchain/core/testing";
import { testSettings } from "../support/settings";

const databases = new Set<AgentDatabase>();
afterEach(async () => {
  for (const db of databases) {
    db.close();
  }
  databases.clear();
  await cleanupDatabaseDirs();
});
test("persists assistant chunks with stable message and part identities", () => {
  const stream = makeStreamRecorder();
  const state = createStreamLogState();
  handleStreamEvent(
    stream.ctx,
    ["messages", [new AIMessageChunk({ content: "hello", id: "message-1" }), {}]],
    state,
    1,
  );
  handleStreamEvent(
    stream.ctx,
    ["messages", [new AIMessageChunk({ content: " world" }), {}]],
    state,
    1,
  );
  handleStreamEvent(
    stream.ctx,
    ["messages", [new ToolMessageChunk({ content: "output", tool_call_id: "call" }), {}]],
    state,
    1,
  );
  expect(stream.events).toMatchObject([
    {
      kind: "assistant_text_delta",
      messageId: "message-1",
      partId: "part-0",
      value: "hello",
    },
    {
      kind: "assistant_text_delta",
      messageId: "message-1",
      partId: "part-0",
      value: " world",
    },
  ]);
});
test("allocates new parts when stream kinds interleave", () => {
  const stream = makeStreamRecorder();
  const state = createStreamLogState();
  handleStreamEvent(
    stream.ctx,
    [
      "messages",
      [
        new AIMessageChunk({
          content: [{ reasoning: "分析", type: "reasoning" }],
          id: "message-1",
        }),
        {},
      ],
    ],
    state,
    2,
  );
  handleStreamEvent(
    stream.ctx,
    ["messages", [new AIMessageChunk({ content: "答案" }), {}]],
    state,
    2,
  );
  expect(stream.events.map(({ kind, partId }) => ({ kind, partId }))).toEqual([
    { kind: "assistant_reasoning_delta", partId: "part-0" },
    { kind: "assistant_text_delta", partId: "part-1" },
  ]);
});
test("persists indexed tool chunks and preserves Freeform markers", () => {
  const stream = makeStreamRecorder();
  const call: RawInputToolCallChunk = {
    args: "*** Begin Patch\n",
    id: "call-1",
    index: 0,
    isCustomTool: true,
    name: "apply_patch",
    type: "tool_call_chunk",
  };
  handleStreamEvent(
    stream.ctx,
    [
      "messages",
      [new AIMessageChunk({ content: "", id: "message-1", tool_call_chunks: [call] }), {}],
    ],
    createStreamLogState(),
    2,
  );
  expect(stream.events[0]).toMatchObject({
    kind: "tool_call_delta",
    messageId: "message-1",
    partId: "part-0",
    value: {
      argumentsDelta: "*** Begin Patch\n",
      freeform: true,
      idDelta: "call-1",
      index: 0,
      nameDelta: "apply_patch",
    },
  });
});
test("rejects content-bearing chunks without a stable message identity", () => {
  const stream = makeStreamRecorder();
  expect(() =>
    handleStreamEvent(
      stream.ctx,
      ["messages", [new AIMessageChunk({ content: "orphan" }), {}]],
      createStreamLogState(),
      1,
    ),
  ).toThrow("模型流增量缺少稳定消息 ID");
});
test("discarding a failed attempt clears its queue stream and resets part identity", () => {
  const stream = makeStreamRecorder();
  const state = createStreamLogState();
  handleStreamEvent(
    stream.ctx,
    ["messages", [new AIMessageChunk({ content: "partial", id: "attempt-1" }), {}]],
    state,
    7,
  );
  discardActiveStream(stream.ctx, state, 7);
  expect(stream.discarded).toEqual([7]);
  handleStreamEvent(
    stream.ctx,
    ["messages", [new AIMessageChunk({ content: "retry", id: "attempt-2" }), {}]],
    state,
    7,
  );
  expect(stream.events.at(-1)).toMatchObject({
    messageId: "attempt-2",
    partId: "part-0",
    value: "retry",
  });
});
function makeStreamRecorder() {
  const db = makeDb();
  databases.add(db);
  const events: Parameters<AgentDatabase["appendStream"]>[1][] = [];
  const discarded: number[] = [];
  spyOn(db, "appendStream").mockImplementation((_sessionId, event) => {
    events.push(event);
    return { ...event, id: events.length };
  });
  spyOn(db, "discardQueueStream").mockImplementation((queueId) => {
    discarded.push(queueId);
  });
  const settings = testSettings(workspace);
  const logger = new Logger("error", true);
  const checkpointer = new BunSqliteSaver(db.db, "session");
  const hooks = new HookRuntime([], [], db.db, logger, "session", workspace);
  const graph = createAgentGraph({ checkpointer, hooks, model: fakeModel(), settings, tools: [] });
  const ctx: HostContext = {
    checkpointer,
    controller: new AbortController(),
    db,
    graph,
    logger,
    observer: { token: () => undefined },
    sessionId: "session",
    settings,
  };
  return { ctx, discarded, events };
}
