import { AIMessage, ToolMessage } from "@langchain/core/messages";
import { expect, test } from "bun:test";
import { ToolExecutions } from "../../src/agent/toolExecutions";
import { recordToolExecutionStarted } from "../../src/runtime/stream";
test("only the next pending tool call is marked as started", () => {
  const started: string[] = [];
  const executions = new ToolExecutions();
  recordToolExecutionStarted(
    {
      db: {
        toolStarted: (_sessionId: string, _queueId: number, callId: string) => {
          started.push(callId);
        },
      },
      sessionId: "session",
      toolExecutions: executions,
    } as never,
    [
      new AIMessage({
        content: "",
        tool_calls: [
          { args: {}, id: "call-1", name: "first" },
          { args: {}, id: "call-2", name: "second" },
        ],
      }),
      new ToolMessage({ content: "done", tool_call_id: "call-1" }),
    ],
    1,
  );
  expect(started).toEqual(["call-2"]);
  expect(executions.cancel("call-1")).toBe(false);
  expect(executions.cancel("call-2")).toBe(true);
});
