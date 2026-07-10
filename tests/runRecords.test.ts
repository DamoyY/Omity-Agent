import { AIMessage, HumanMessage } from "@langchain/core/messages";
import { afterEach, expect, test } from "bun:test";
import { cleanupDatabaseDirs, makeDb, workspace } from "./support/database";

afterEach(cleanupDatabaseDirs);

test("replace history preserves consumed queue ids", () => {
  const db = makeDb();
  db.resetSession("123", workspace);
  const first = db.appendUser("123", "第一条");
  const second = db.appendUser("123", "第二条");

  db.replaceHistory(
    "123",
    [
      new HumanMessage("第一条"),
      new AIMessage("中间响应"),
      new HumanMessage("第二条"),
      new AIMessage("最终响应"),
    ],
    [first, second],
  );

  const rows = db.db
    .query<{ queue_id: number | null }, []>(
      "SELECT queue_id FROM messages ORDER BY id",
    )
    .all();
  expect(rows.map((row) => row.queue_id)).toEqual([first, null, second, null]);
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
