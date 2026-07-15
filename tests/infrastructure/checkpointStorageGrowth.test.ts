import { AIMessage, ToolMessage } from "@langchain/core/messages";
import { afterEach, expect, test } from "bun:test";
import { cleanupDatabaseDirs, makeDb, required, workspace } from "../support/database";
import { BunSqliteSaver } from "../../src/checkpointer";
import type { RunnableConfig } from "@langchain/core/runnables";

const messageCount = 64;
const instructionsSentinel = `instructions-${"i".repeat(4096)}`;
const toolsSentinel = `tools-${"t".repeat(4096)}`;

afterEach(cleanupDatabaseDirs);
test("checkpoint churn keeps one compact head and one copy of each message", async () => {
  const database = makeDb();
  database.resetSession("session", workspace);
  const saver = new BunSqliteSaver(database.db, "session");
  const messages: AIMessage[] = [];
  let config: RunnableConfig = { configurable: { thread_id: "session:1" } };
  let firstCheckpointBytes = 0;
  for (let index = 1; index <= messageCount; index += 1) {
    messages.push(message(index));
    config = await saver.put(
      config,
      checkpoint(messages, index),
      { parents: {}, source: "loop", step: index },
      { messages: index },
    );
    if (index === 1) {
      firstCheckpointBytes = checkpointBytes(database.db);
    }
    if (index < messageCount) {
      await saver.putWrites(
        config,
        [["messages", [pendingMessage(index)]]],
        `task-${index.toString()}`,
      );
    }
  }
  expect(rowCount(database.db, "checkpoints")).toBe(1);
  expect(rowCount(database.db, "messages")).toBe(messageCount);
  expect(rowCount(database.db, "writes")).toBe(0);
  expect(rowCount(database.db, "write_messages")).toBe(0);
  expect(checkpointBytes(database.db)).toBeLessThanOrEqual(firstCheckpointBytes + 128);
  expect(messagePayloadBytes(database.db)).toBeLessThan(10_000);
  expect(storedOccurrences(database.db, instructionsSentinel)).toBe(0);
  expect(storedOccurrences(database.db, toolsSentinel)).toBe(0);
  expect(rawCheckpointContains(database.db, "conversation-body-64")).toBe(false);
  expect(storedOccurrences(database.db, "pending-artifact-63")).toBe(0);
  database.close();
});

function message(index: number) {
  return new AIMessage({
    content: `conversation-body-${index.toString()}`,
    id: `assistant-${index.toString()}`,
    response_metadata: {
      instructions: instructionsSentinel,
      tools: [{ description: toolsSentinel, name: "large_tool" }],
    },
  });
}

function pendingMessage(index: number) {
  return new ToolMessage({
    artifact: [{ data: `pending-artifact-${index.toString()}`, type: "resource" }],
    content: `pending-body-${index.toString()}`,
    id: `pending-${index.toString()}`,
    tool_call_id: `call-${index.toString()}`,
  });
}

function checkpoint(messages: AIMessage[], index: number) {
  return {
    channel_values: { messages },
    channel_versions: { messages: index },
    id: `00000000-0000-6000-8000-${index.toString().padStart(12, "0")}`,
    ts: new Date(index).toISOString(),
    v: 4,
    versions_seen: {},
  };
}

type TestDatabase = ReturnType<typeof makeDb>["db"];
type CountedTable = "checkpoints" | "messages" | "write_messages" | "writes";

function checkpointBytes(db: TestDatabase) {
  return required(
    db.query<{ bytes: number }, []>("SELECT length(checkpoint) AS bytes FROM checkpoints").get(),
  ).bytes;
}

function messagePayloadBytes(db: TestDatabase) {
  return required(
    db
      .query<{ bytes: number }, []>(
        "SELECT COALESCE(SUM(length(message_json)), 0) AS bytes FROM messages",
      )
      .get(),
  ).bytes;
}

function rowCount(db: TestDatabase, table: CountedTable) {
  return required(db.query<{ count: number }, []>(`SELECT COUNT(*) AS count FROM ${table}`).get())
    .count;
}

function storedOccurrences(db: TestDatabase, value: string) {
  return required(
    db
      .query<{ count: number }, [string]>(
        "SELECT COUNT(*) AS count FROM messages WHERE instr(message_json, ?) > 0",
      )
      .get(value),
  ).count;
}

function rawCheckpointContains(db: TestDatabase, value: string) {
  return (
    required(
      db
        .query<{ count: number }, [string]>(
          "SELECT COUNT(*) AS count FROM checkpoints WHERE instr(CAST(checkpoint AS TEXT), ?) > 0",
        )
        .get(value),
    ).count > 0
  );
}
