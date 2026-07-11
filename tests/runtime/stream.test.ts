import { AIMessageChunk, ToolMessageChunk } from "@langchain/core/messages";
import { expect, test } from "bun:test";
import {
  createStreamLogState,
  handleStreamEvent,
  incrementalSummary,
} from "../../src/runtime/stream";

test("stream debug logging keeps only incremental context", () => {
  const state = createStreamLogState();
  const first = {
    values: {
      messages: [
        { id: "user-1", content: "第一条" },
        { id: "ai-1", content: "中间响应" },
      ],
    },
  };
  const second = {
    values: {
      messages: [
        { id: "user-1", content: "第一条" },
        { id: "ai-1", content: "中间响应" },
        { id: "user-2", content: "第二条" },
      ],
    },
  };

  expect(incrementalSummary(first, state)).toEqual(first);
  expect(incrementalSummary(second, state)).toEqual({
    values: {
      messages: [{ id: "user-2", content: "第二条" }],
    },
  });
  expect(incrementalSummary(second, state)).toBeUndefined();
});

test("stream update and debug events share one printed-information state", () => {
  const state = createStreamLogState();
  const update = { model_request: { messages: [{ content: "hello" }] } };
  const debug = { task: { input: { messages: [{ content: "hello" }] } } };

  expect(incrementalSummary(update, state)).toEqual(update);
  expect(incrementalSummary(debug, state)).toBeUndefined();
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
    [
      "messages",
      [
        new ToolMessageChunk({ content: "tool output", tool_call_id: "call" }),
        {},
      ],
    ],
    createStreamLogState(),
    1,
  );

  expect(stream.tokens).toEqual([{ queueId: 1, text: "hello" }]);
});

test("stream messages persist assistant tool call chunks", () => {
  const stream = makeStreamRecorder();
  handleStreamEvent(
    stream.ctx,
    [
      "messages",
      [
        new AIMessageChunk({
          id: "message-1",
          content: "",
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

function makeStreamRecorder() {
  const tokens: {
    messageId?: string;
    queueId: number;
    text: string;
  }[] = [];
  const toolCalls: {
    call: {
      args?: string;
      id?: string;
      index?: number;
      name?: string;
    };
    messageId?: string;
    queueId: number;
  }[] = [];
  return {
    ctx: {
      db: {
        streamToken: (
          _sessionId: string,
          queueId: number,
          text: string,
          messageId?: string,
        ) =>
          tokens.push({ queueId, text, ...(messageId ? { messageId } : {}) }),
        streamToolCall: (
          _sessionId: string,
          queueId: number,
          call: {
            args?: string;
            id?: string;
            index?: number;
            name?: string;
          },
          messageId?: string,
        ) =>
          toolCalls.push({
            call,
            queueId,
            ...(messageId ? { messageId } : {}),
          }),
      },
      logger: { debug: () => undefined, token: () => undefined },
      observer: { token: () => undefined },
      sessionId: "session",
      settings: { logging: { streamTokens: false } },
    } as never,
    tokens,
    toolCalls,
  };
}
