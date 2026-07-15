import { expect, mock, spyOn, test } from "bun:test";
import { upsertSessionList, withoutSession } from "../../../src/app/frontend/services/queries";
import type { SessionInfo } from "../../../src/app/sessionState";
import { appEvents } from "../../../src/app/frontend/services/client";

test("session upserts are idempotent across SSE and HTTP responses", () => {
  const idle = session("idle", 1);
  const running = session("model", 2);
  const sessions = upsertSessionList(upsertSessionList([idle], running), running);
  expect(sessions).toEqual([running]);
});
test("session deletion is idempotent", () => {
  const once = withoutSession([session("idle", 1)], "session");
  expect(withoutSession(once, "session")).toEqual([]);
});
test("SSE closes after the first network error instead of reconnecting", () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "EventSource");
  const log = spyOn(console, "error").mockReturnValue(undefined);
  const created: TestEventSource[] = [];
  class TestEventSource extends EventTarget {
    close = mock(() => undefined);
    constructor(readonly url: string) {
      super();
      created.push(this);
    }
  }
  Object.defineProperty(globalThis, "EventSource", {
    configurable: true,
    value: TestEventSource,
  });
  try {
    appEvents();
    const [events] = created;
    if (!events) {
      throw new Error("EventSource 替身未创建");
    }
    expect(events.url).toBe("api/events");
    events.dispatchEvent(new Event("error"));
    expect(events.close).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledTimes(1);
  } finally {
    log.mockRestore();
    if (descriptor) {
      Object.defineProperty(globalThis, "EventSource", descriptor);
    } else {
      Reflect.deleteProperty(globalThis, "EventSource");
    }
  }
});
function session(status: SessionInfo["status"], updatedAt: number): SessionInfo {
  return {
    createdAt: 1,
    error: null,
    id: "session",
    status,
    updatedAt,
    workspace: "F:/workspace",
  };
}
