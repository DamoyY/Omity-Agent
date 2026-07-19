import { AIMessage, HumanMessage, ToolMessage } from "@langchain/core/messages";
import { afterEach, expect, test } from "bun:test";
import { cleanupDatabaseDirs, makeDb, required, workspace } from "../../support/database";
import type { StreamEvent } from "../../../src/infrastructure/database/records/streamEvents";
import { buildTimeline } from "../../../src/app/timeline";
import { loadTranscript } from "../../../src/app/transcript";

afterEach(cleanupDatabaseDirs);
test("syncing tool output emits a versioned completion event", () => {
  const db = makeDb();
  const sessionId = "tool-finished-session";
  db.resetSession(sessionId, workspace);
  const queueId = db.appendUser(sessionId, "run command");
  db.startQueue(sessionId, required(db.nextQueue(sessionId)));
  db.appendStream(sessionId, {
    kind: "tool_call_delta",
    messageId: "assistant-1",
    partId: "tool-0",
    queueId,
    value: {
      idDelta: "call-1",
      index: 0,
      nameDelta: "shell",
    },
  });
  db.appendStream(sessionId, {
    kind: "tool_started",
    messageId: "assistant-1",
    partId: "tool-0",
    queueId,
    value: "call-1",
  });
  const emitted: StreamEvent[] = [];
  db.onChange((event) => emitted.push(event));
  db.syncHistory(sessionId, [
    new HumanMessage({ content: "run command", id: `queue:${sessionId}:${queueId.toString()}` }),
    new AIMessage({
      content: "",
      id: "assistant-1",
      tool_calls: [{ args: {}, id: "call-1", name: "shell" }],
    }),
    new ToolMessage({ content: "done", id: "tool-1", tool_call_id: "call-1" }),
  ]);
  const transcript = loadTranscript(db, sessionId);
  expect(emitted).toHaveLength(1);
  expect(emitted[0]).toMatchObject({
    kind: "tool_finished",
    value: "call-1",
  });
  expect(transcript.eventCursor).toBe(required(emitted[0]).id);
  expect(transcript.events.map(({ kind }) => kind)).toEqual(["user_appended", "tool_finished"]);
  const tool = buildTimeline(transcript.messages, transcript.queue, transcript.events)
    .flatMap((message) => message.parts)
    .find((part) => part.type === "tool");
  expect(tool?.type === "tool" ? tool.output?.content : undefined).toBe("done");
  expect(tool?.type === "tool" ? tool.started : undefined).toBeUndefined();
  db.close();
});
