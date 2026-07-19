import { expect, test } from "bun:test";
import { makeDb, required, workspace } from "../support/database";
import { insertStreamEvent } from "../../src/infrastructure/database/records/streamEvents";
import { toolNotRunning } from "../../src/errors";

test("tool cancellation requests are persisted and consumed once", () => {
  const db = makeDb();
  try {
    db.resetSession("session", workspace);
    db.appendUser("session", "run tool");
    const item = required(db.nextQueue("session"));
    db.startQueue("session", item);
    insertStreamEvent(db.db, "session", {
      kind: "tool_started",
      messageId: "message-1",
      partId: "tool-0",
      queueId: item.id,
      value: "call-1",
    });
    db.requestToolCancellation("session", "call-1");
    expect(db.takeToolCancellation("session", "call-1")).toBe(true);
    expect(db.takeToolCancellation("session", "call-1")).toBe(false);
  } finally {
    db.close();
  }
});
test("tool cancellation rejects calls that are not running", () => {
  const db = makeDb();
  try {
    db.resetSession("session", workspace);
    expect(() => {
      db.requestToolCancellation("session", "missing");
    }).toThrow(toolNotRunning("missing").message);
  } finally {
    db.close();
  }
});
