import { afterEach, expect, test } from "bun:test";
import { formatData, Logger } from "../src/infrastructure/logger";

const logs: string[] = [];
const originalLog = console.log;

afterEach(() => {
  console.log = originalLog;
  logs.length = 0;
});

test("logger prints multi-line structured data", () => {
  console.log = (message?: unknown) => {
    logs.push(String(message));
  };

  const logger = new Logger("debug");
  const end = logger.child("队列 #1");
  logger.debug("等待 Client 输入", { sessionId: "123", retry: 2 });
  end();

  const text = stripAnsi(logs.join("\n"));
  expect(text).toContain("INFO  ● ┌─ 队列 #1");
  expect(text).toContain("DEBUG ·   等待 Client 输入");
  expect(text).toContain("│   sessionId: 123");
  expect(text).toContain("│   retry: 2");
  expect(text).toContain("INFO  ● └─ 队列 #1");
});

test("formatData pretty prints nested values", () => {
  const lines = stripAnsi(formatData({ payload: { ok: true } }).join("\n"));
  expect(lines).toBe('payload:\n  {\n    "ok": true\n  }');
});

function stripAnsi(value: string) {
  return value.replace(/\x1B\[[0-9;]*m/g, "");
}
