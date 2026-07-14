import {
  AIMessageChunk,
  type RawInputToolCallChunk,
  ToolMessageChunk,
} from "@langchain/core/messages";
import { createStreamLogState, handleStreamEvent } from "../../src/runtime/stream";
import { expect, test } from "bun:test";
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
  return {
    ctx: {
      db: {
        streamReasoning: (_sessionId: string, queueId: number, text: string, messageId?: string) =>
          reasoning.push({
            queueId,
            text,
            ...(messageId ? { messageId } : {}),
          }),
        streamToken: (_sessionId: string, queueId: number, text: string, messageId?: string) =>
          tokens.push({ queueId, text, ...(messageId ? { messageId } : {}) }),
        streamToolCall: (
          _sessionId: string,
          queueId: number,
          call: {
            args?: string;
            freeform?: boolean;
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
    reasoning,
    tokens,
    toolCalls,
  };
}
