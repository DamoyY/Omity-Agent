import { AIMessage, HumanMessage, ToolMessage } from "@langchain/core/messages";
import { afterEach, expect, test } from "bun:test";
import {
  afterQuery,
  cleanupDatabaseDirs,
  makeDatabases,
  makeDb,
  required,
  workspace,
} from "../support/database";
import {
  appendTranscriptEvents,
  emptyTranscriptData,
  reconcileTranscript,
} from "../../src/app/frontend/services/transcript/cache";
import { buildTimeline, displayStreamEvent } from "../../src/app/timeline";
import type { StreamEvent } from "../../src/infrastructure/database/records/streamEvents";
import { countTokens } from "../../src/runtime/tokenizer";
import { loadTranscript } from "../../src/app/transcript";

afterEach(cleanupDatabaseDirs);
test("transcript exposes Responses API token and cache usage", () => {
  const db = makeDb();
  db.resetSession("usage-session", workspace);
  db.syncHistory("usage-session", [
    new HumanMessage("问题"),
    new AIMessage({
      content: "答案",
      usage_metadata: {
        input_token_details: { cache_read: 900 },
        input_tokens: 1200,
        output_tokens: 300,
        total_tokens: 1500,
      },
    }),
  ]);
  const transcript = loadTranscript(db, "usage-session");
  expect(view(transcript).at(-1)?.usage).toEqual({
    cacheReadTokens: 900,
    inputTokens: 1200,
    outputTokens: 300,
  });
  db.close();
});
test("transcript counts raw tool input and output text", () => {
  const db = makeDb();
  const args = { command: "echo 你好" };
  const output = "执行完成";
  db.resetSession("tool-token-session", workspace);
  db.syncHistory("tool-token-session", [
    new HumanMessage("运行命令"),
    new AIMessage({
      content: "",
      tool_calls: [{ args, id: "call-1", name: "shell" }],
    }),
    new ToolMessage({ content: output, tool_call_id: "call-1" }),
  ]);
  const transcript = loadTranscript(db, "tool-token-session");
  const part = view(transcript)
    .flatMap((message) => message.parts)
    .find((item) => item.type === "tool");
  expect(part?.type).toBe("tool");
  if (part?.type !== "tool") {
    throw new Error("工具调用未显示");
  }
  expect(part.call.inputTokens).toBe(countTokens(JSON.stringify(args)));
  expect(part.output?.outputTokens).toBe(countTokens(output));
  db.close();
});
test("transcript exposes original Freeform tool input", () => {
  const db = makeDb();
  const input = "*** Begin Patch\n*** End Patch";
  db.resetSession("freeform-session", workspace);
  db.syncHistory("freeform-session", [
    new AIMessage({
      additional_kwargs: {
        __openai_custom_tool_call_ids__: { "call-1": "ct-1" },
      },
      content: "",
      tool_calls: [{ args: { input }, id: "call-1", name: "apply_patch" }],
    }),
  ]);
  const part = view(loadTranscript(db, "freeform-session"))
    .flatMap((message) => message.parts)
    .find((item) => item.type === "tool");
  expect(part?.type === "tool" ? part.call.rawInput : undefined).toBe(input);
  db.close();
});
test("transcript keeps the original token count for redirected output", () => {
  const db = makeDb();
  db.resetSession("large-output-session", workspace);
  db.syncHistory("large-output-session", [
    new AIMessage({
      content: "",
      tool_calls: [{ args: {}, id: "call-1", name: "shell" }],
    }),
    new ToolMessage({
      content: "工具输出过长，已重定向",
      metadata: { largeOutput: { path: "output.txt", tokens: 12_345 } },
      tool_call_id: "call-1",
    }),
  ]);
  const part = view(loadTranscript(db, "large-output-session"))
    .flatMap((message) => message.parts)
    .find((item) => item.type === "tool");
  expect(part?.output?.outputTokens).toBe(12_345);
  db.close();
});
test("live stream events match persisted snapshots and keep their cursor", () => {
  const db = makeDb();
  db.resetSession("stream-session", workspace);
  const queueId = db.appendUser("stream-session", "question");
  const emitted: StreamEvent[] = [];
  db.onChange((event) => emitted.push(event));
  const event = db.appendStream("stream-session", {
    kind: "assistant_text_delta",
    messageId: "message-1",
    partId: "text-1",
    queueId,
    value: "hello",
  });
  const streaming = loadTranscript(db, "stream-session");
  expect(emitted).toEqual([event]);
  expect(streaming.events).toEqual([displayStreamEvent(event)]);
  expect(streaming.eventCursor).toBe(event.id);
  db.syncHistory("stream-session", [new HumanMessage("question"), new AIMessage("hello")]);
  const completed = loadTranscript(db, "stream-session");
  expect(completed.events).toEqual([]);
  expect(completed.eventCursor).toBe(event.id);
  db.close();
});
test("snapshot refresh does not discard a tool event committed after its events were read", () => {
  const databases = makeDatabases(2);
  const reader = required(databases[0]);
  const writer = required(databases[1]);
  const sessionId = "stream-race-session";
  reader.resetSession(sessionId, workspace);
  const queueId = reader.appendUser(sessionId, "run command");
  reader.startQueue(sessionId, required(reader.nextQueue(sessionId)));
  const emitted: StreamEvent[] = [];
  writer.onChange((event) => emitted.push(event));
  const racingReader = afterQuery(reader, "FROM events WHERE session_id", () => {
    writer.appendStream(sessionId, {
      kind: "tool_call_delta",
      messageId: "assistant-race",
      partId: "tool-0",
      queueId,
      value: {
        argumentsDelta: '{"command":"pwd"}',
        idDelta: "call-race",
        index: 0,
        nameDelta: "terminal_send_command",
      },
    });
  });
  const snapshot = (() => {
    try {
      return loadTranscript(racingReader, sessionId);
    } finally {
      reader.close();
      writer.close();
    }
  })();
  const current = appendTranscriptEvents(emptyTranscriptData(), emitted.map(displayStreamEvent));
  const reconciled = reconcileTranscript(snapshot, current);
  const toolPart = reconciled.view
    .flatMap((message) => message.parts)
    .find((part) => part.type === "tool");
  expect(emitted).toHaveLength(1);
  expect(toolPart).toMatchObject({
    call: { id: "call-race", name: "terminal_send_command" },
    type: "tool",
  });
});
function view(transcript: ReturnType<typeof loadTranscript>) {
  return buildTimeline(transcript.messages, transcript.queue, transcript.events);
}
