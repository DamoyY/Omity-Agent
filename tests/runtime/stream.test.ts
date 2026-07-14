import {
  AIMessageChunk,
  type RawInputToolCallChunk,
  ToolMessageChunk,
} from "@langchain/core/messages";
import { afterEach, expect, spyOn, test } from "bun:test";
import { cleanupDatabaseDirs, makeDb, workspace } from "../support/database";
import { createStreamLogState, handleStreamEvent } from "../../src/runtime/stream";
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
test("stream messages persist only assistant text chunks", () => {
  const stream = makeStreamRecorder();
  handleStreamEvent(
    stream.ctx,
    ["messages", [new AIMessageChunk("hello"), {}]],
    createStreamLogState(),
    1,
  );
  handleStreamEvent(
    stream.ctx,
    ["messages", [new ToolMessageChunk({ content: "tool output", tool_call_id: "call" }), {}]],
    createStreamLogState(),
    1,
  );
  expect(stream.tokens).toEqual([{ queueId: 1, text: "hello" }]);
});
test("stream messages persist assistant reasoning chunks", () => {
  const stream = makeStreamRecorder();
  handleStreamEvent(
    stream.ctx,
    [
      "messages",
      [
        new AIMessageChunk({
          content: [{ reasoning: "分析中", type: "reasoning" }],
          id: "message-1",
        }),
        {},
      ],
    ],
    createStreamLogState(),
    2,
  );
  expect(stream.reasoning).toEqual([{ messageId: "message-1", queueId: 2, text: "分析中" }]);
});
test("stream messages persist assistant tool call chunks", () => {
  const stream = makeStreamRecorder();
  handleStreamEvent(
    stream.ctx,
    [
      "messages",
      [
        new AIMessageChunk({
          content: "",
          id: "message-1",
          tool_call_chunks: [
            {
              args: '{"path":',
              id: "call-1",
              index: 0,
              name: "read_file",
            },
          ],
        }),
        {},
      ],
    ],
    createStreamLogState(),
    2,
  );
  expect(stream.toolCalls).toEqual([
    {
      call: {
        args: '{"path":',
        id: "call-1",
        index: 0,
        name: "read_file",
      },
      messageId: "message-1",
      queueId: 2,
    },
  ]);
});
test("stream messages preserve Freeform tool call markers", () => {
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
    ["messages", [new AIMessageChunk({ content: "", tool_call_chunks: [call] }), {}]],
    createStreamLogState(),
    2,
  );
  expect(stream.toolCalls[0]?.call).toEqual({
    args: "*** Begin Patch\n",
    freeform: true,
    id: "call-1",
    index: 0,
    name: "apply_patch",
  });
});
function makeStreamRecorder() {
  const db = makeDb();
  databases.add(db);
  const tokens: {
    messageId?: string;
    queueId: number;
    text: string;
  }[] = [];
  const reasoning: {
    messageId?: string;
    queueId: number;
    text: string;
  }[] = [];
  const toolCalls: {
    call: {
      args?: string;
      freeform?: boolean;
      id?: string;
      index?: number;
      name?: string;
    };
    messageId?: string;
    queueId: number;
  }[] = [];
  spyOn(db, "streamReasoning").mockImplementation((_sessionId, queueId, text, messageId) => {
    reasoning.push({ queueId, text, ...(messageId ? { messageId } : {}) });
    return {
      id: reasoning.length,
      kind: "assistant_reasoning_delta",
      queueId,
      value: text,
      ...(messageId ? { messageId } : {}),
    };
  });
  spyOn(db, "streamToken").mockImplementation((_sessionId, queueId, text, messageId) => {
    tokens.push({ queueId, text, ...(messageId ? { messageId } : {}) });
    return {
      id: tokens.length,
      kind: "assistant_text_delta",
      queueId,
      value: text,
      ...(messageId ? { messageId } : {}),
    };
  });
  spyOn(db, "streamToolCall").mockImplementation((_sessionId, queueId, call, messageId) => {
    toolCalls.push({ call, queueId, ...(messageId ? { messageId } : {}) });
    return {
      id: toolCalls.length,
      kind: "tool_call_delta",
      queueId,
      value: call,
      ...(messageId ? { messageId } : {}),
    };
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
  return {
    ctx,
    reasoning,
    tokens,
    toolCalls,
  };
}
