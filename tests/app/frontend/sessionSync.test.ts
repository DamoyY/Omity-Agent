import { expect, test } from "bun:test";
import {
  upsertSessionList,
  withoutSession,
} from "../../../src/app/frontend/services/queries";
import type { SessionInfo } from "../../../src/app/sessionState";

test("session upserts are idempotent across SSE and HTTP responses", () => {
  const idle = session("idle", 1);
  const running = session("model", 2);

  const sessions = upsertSessionList(
    upsertSessionList([idle], running),
    running,
  );

  expect(sessions).toEqual([running]);
});

test("session deletion is idempotent", () => {
  const once = withoutSession([session("idle", 1)], "session");
  expect(withoutSession(once, "session")).toEqual([]);
});

function session(
  status: SessionInfo["status"],
  updatedAt: number,
): SessionInfo {
  return {
    id: "session",
    workspace: "F:/workspace",
    createdAt: 1,
    updatedAt,
    status,
    error: null,
  };
}
