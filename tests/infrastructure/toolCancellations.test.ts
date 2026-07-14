import { expect, test } from "bun:test";
import { insertToolStarted } from "../../src/infrastructure/database/records/streamEvents";
import { toolNotRunning } from "../../src/errors";
import { makeDb, required, workspace } from "../support/database";
test("tool cancellation requests are persisted and consumed once", () => {
  const db = makeDb();
  try {
    db.resetSession("session", workspace);
    db.appendUser("session", "run tool");
    const item = required(db.nextQueue("session"));
    db.startQueue("session", item);
    insertToolStarted(db.db, "session", item.id, "call-1");
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
