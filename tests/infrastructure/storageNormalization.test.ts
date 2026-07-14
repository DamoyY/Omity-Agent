import { AIMessage, ToolMessage, mapChatMessagesToStoredMessages } from "@langchain/core/messages";
import { afterEach, expect, test } from "bun:test";
import { BunSqliteSaver } from "../../src/checkpointer";
import { cleanupDatabaseDirs, makeDb, required, workspace } from "../support/database";
afterEach(cleanupDatabaseDirs);
test("one database stores each message body once and clears terminal recovery data", async () => {
  const db = makeDb();
  db.resetSession("session", workspace);
  const userText = "unique-user-body-4f18";
  const assistantText = "unique-assistant-body-72cd";
  const toolText = "unique-tool-body-a913";
  db.appendUser("session", userText);
  db.startQueue("session", required(db.nextQueue("session")));
  const toolOutput = new ToolMessage({
    id: "hook-output",
    content: toolText,
    tool_call_id: "hook-call",
  });
  const assistant = new AIMessage({
    id: "assistant-output",
    content: assistantText,
  });
  const messages = [...db.history("session"), assistant];
  const saver = new BunSqliteSaver(db.db, "session");
  const saved = await saver.put(
    { configurable: { thread_id: "session:1" } },
    checkpoint(messages),
    { source: "loop", step: 0, parents: {} },
  );
  const [storedAssistant] = mapChatMessagesToStoredMessages([assistant]);
  if (!storedAssistant) throw new Error("测试消息序列化失败");
  await saver.putWrites(
    saved,
    [
      ["messages", [toolOutput]],
      ["hookPlan", { kind: "tools", original: storedAssistant }],
    ],
    "task",
  );
  const ignoredText = "ignored-pending-body-c381";
  await saver.putWrites(
    saved,
    [
      [
        "messages",
        [
          new ToolMessage({
            id: "ignored-output",
            content: ignoredText,
            tool_call_id: "ignored-call",
          }),
        ],
      ],
    ],
    "task",
  );
  const tables = new Set(tableNames(db.db));
  for (const table of [
    "sessions",
    "queue",
    "message_blobs",
    "messages",
    "checkpoints",
    "writes",
    "hook_usage",
  ]) {
    expect(tables.has(table)).toBe(true);
  }
  expect(storedOccurrences(db.db, userText)).toBe(1);
  expect(storedOccurrences(db.db, assistantText)).toBe(1);
  expect(storedOccurrences(db.db, toolText)).toBe(1);
  expect(storedOccurrences(db.db, ignoredText)).toBe(0);
  expect(rawRecoveryContains(db.db, userText)).toBe(false);
  expect(rawRecoveryContains(db.db, assistantText)).toBe(false);
  expect(rawRecoveryContains(db.db, toolText)).toBe(false);
  const loaded = required(await saver.getTuple(saved));
  expect(required(loaded.pendingWrites)[0]?.[2]).toEqual([toolOutput]);
  expect(required(loaded.pendingWrites)[1]?.[2]).toEqual({
    kind: "tools",
    original: storedAssistant,
  });
  expect(
    db.db.query<{ content: string | null }, []>("SELECT content FROM queue").get()?.content,
  ).toBeNull();
  await saver.deleteThread("session:1");
  expect(rowCount(db.db, "checkpoints")).toBe(0);
  expect(rowCount(db.db, "writes")).toBe(0);
  expect(rowCount(db.db, "hook_usage")).toBe(0);
  expect(storedOccurrences(db.db, toolText)).toBe(0);
  expect(storedOccurrences(db.db, userText)).toBe(1);
  expect(storedOccurrences(db.db, assistantText)).toBe(1);
  db.close();
});
function checkpoint(messages: unknown[]) {
  return {
    v: 4,
    id: "00000000-0000-6000-8000-000000000001",
    ts: new Date(0).toISOString(),
    channel_values: { messages },
    channel_versions: { messages: 1 },
    versions_seen: {},
  };
}
function tableNames(db: ReturnType<typeof makeDb>["db"]) {
  return db
    .query<{ name: string }, []>("SELECT name FROM sqlite_schema WHERE type = 'table'")
    .all()
    .map((row) => row.name);
}
function storedOccurrences(db: ReturnType<typeof makeDb>["db"], text: string) {
  return required(
    db
      .query<{ count: number }, [string]>(
        "SELECT COUNT(*) AS count FROM message_blobs WHERE instr(message_json, ?) > 0",
      )
      .get(text),
  ).count;
}
function rawRecoveryContains(db: ReturnType<typeof makeDb>["db"], value: string) {
  const checkpointCount = required(
    db
      .query<{ count: number }, [string]>(
        "SELECT COUNT(*) AS count FROM checkpoints WHERE instr(CAST(checkpoint AS TEXT), ?) > 0",
      )
      .get(value),
  ).count;
  const writeCount = required(
    db
      .query<{ count: number }, [string]>(
        "SELECT COUNT(*) AS count FROM writes WHERE instr(CAST(value AS TEXT), ?) > 0",
      )
      .get(value),
  ).count;
  return checkpointCount + writeCount > 0;
}
function rowCount(db: ReturnType<typeof makeDb>["db"], table: string) {
  if (!/^[a-z_]+$/.test(table)) throw new Error(`测试表名无效：${table}`);
  return required(db.query<{ count: number }, []>(`SELECT COUNT(*) AS count FROM ${table}`).get())
    .count;
}
