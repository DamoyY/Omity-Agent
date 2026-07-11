import { AIMessage, HumanMessage } from "@langchain/core/messages";
import { afterEach, expect, test } from "bun:test";
import { queueMessageId } from "../../src/infrastructure/messages";
import { cleanupDatabaseDirs, makeDb, workspace } from "../support/database";

afterEach(cleanupDatabaseDirs);

test("replace history restores queue ids from user message identity", () => {
  const db = makeDb();
  db.resetSession("123", workspace);
  const first = db.appendUser("123", "第一条");
  db.startQueue("123", db.nextQueue("123")!);
  db.setQueueStatus(first, "done");
  const second = db.appendUser("123", "第二条");

  db.replaceHistory("123", [
    new HumanMessage({
      content: "第一条",
      id: queueMessageId("123", first),
    }),
    new AIMessage("中间响应"),
    new HumanMessage({
      content: "第二条",
      id: queueMessageId("123", second),
    }),
    new AIMessage("最终响应"),
  ]);

  const rows = db.db
    .query<{ queue_id: number | null }, []>(
      "SELECT queue_id FROM messages ORDER BY id",
    )
    .all();
  expect(rows.map((row) => row.queue_id)).toEqual([first, null, second, null]);
  db.close();
});

test("replace history rejects queue identities from another session", () => {
  const db = makeDb();
  db.resetSession("123", workspace);

  expect(() =>
    db.replaceHistory("123", [
      new HumanMessage({ content: "错误消息", id: queueMessageId("456", 1) }),
    ]),
  ).toThrow("用户消息属于其他会话");
  db.close();
});

test("append during active run belongs to that run", () => {
  const db = makeDb();
  db.resetSession("123", workspace);
  const first = db.appendUser("123", "第一条");
  const second = db.appendUser("123", "第二条");

  const rows = db.db
    .query<{ id: number; root_queue_id: number }, []>(
      `SELECT q.id, r.root_queue_id FROM queue q
       JOIN runs r ON r.id = q.run_id ORDER BY q.id`,
    )
    .all();
  expect(rows).toEqual([
    { id: first, root_queue_id: first },
    { id: second, root_queue_id: first },
  ]);
  db.close();
});
