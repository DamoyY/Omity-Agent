import { AIMessage, HumanMessage } from "@langchain/core/messages";
import { afterEach, expect, test } from "bun:test";
import { queueMessageId } from "../../src/infrastructure/messages";
import {
  cleanupDatabaseDirs,
  makeDb,
  required,
  workspace,
} from "../support/database";

afterEach(cleanupDatabaseDirs);

test("replace history restores queue ids from user message identity", () => {
  const db = makeDb();
  db.resetSession("123", workspace);
  const first = db.appendUser("123", "第一条");
  db.startQueue("123", required(db.nextQueue("123")));
  db.setQueueStatus(first, "done");
  const second = db.appendUser("123", "第二条");

  db.syncHistory("123", [
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

test("replacing a queued message body moves its queue identity", () => {
  const db = makeDb();
  db.resetSession("123", workspace);
  const queueId = db.appendUser("123", "旧正文");
  db.startQueue("123", required(db.nextQueue("123")));

  db.syncHistory("123", [
    new HumanMessage({
      content: "新正文",
      id: queueMessageId("123", queueId),
    }),
  ]);

  expect(db.history("123").map((message) => message.text)).toEqual(["新正文"]);
  expect(
    db.db
      .query<{ count: number }, [number]>(
        "SELECT COUNT(*) AS count FROM messages WHERE queue_id = ?",
      )
      .get(queueId)?.count,
  ).toBe(1);
  db.close();
});

test("replace history rejects queue identities from another session", () => {
  const db = makeDb();
  db.resetSession("123", workspace);

  expect(() => {
    db.syncHistory("123", [
      new HumanMessage({ content: "错误消息", id: queueMessageId("456", 1) }),
    ]);
  }).toThrow("用户消息属于其他会话");
  db.close();
});

test("append during active run belongs to that run", () => {
  const db = makeDb();
  db.resetSession("123", workspace);
  const first = db.appendUser("123", "第一条");
  const second = db.appendUser("123", "第二条");

  const rows = db.db
    .query<{ id: number; root_id: number }, []>(
      "SELECT id, root_id FROM queue ORDER BY id",
    )
    .all();
  expect(rows).toEqual([
    { id: first, root_id: first },
    { id: second, root_id: first },
  ]);
  db.close();
});

test("reset deletes self-referencing queue rows", () => {
  const db = makeDb();
  db.resetSession("123", workspace);
  db.appendUser("123", "第一条");
  db.appendUser("123", "第二条");

  db.resetSession("123", workspace);

  const row = db.db
    .query<{ count: number }, []>("SELECT COUNT(*) count FROM queue")
    .get();
  expect(row?.count).toBe(0);
  db.close();
});

test("run activity is derived from its queue items", () => {
  const db = makeDb();
  db.resetSession("123", workspace);
  const first = db.appendUser("123", "第一条");
  const second = db.appendUser("123", "第二条");

  db.setQueueStatus(first, "done");
  const third = db.appendUser("123", "第三条");
  expect(queueRoot(db, third)).toBe(first);

  db.setQueueStatus(second, "done");
  db.setQueueStatus(third, "done");
  const fourth = db.appendUser("123", "第四条");
  expect(queueRoot(db, fourth)).toBe(fourth);
  db.close();
});

function queueRoot(db: ReturnType<typeof makeDb>, queueId: number) {
  return required(
    db.db
      .query<{ root_id: number }, [number]>(
        "SELECT root_id FROM queue WHERE id = ?",
      )
      .get(queueId),
  ).root_id;
}
