import { expect, spyOn, test } from "bun:test";
import type { SessionInfo } from "../../src/app/frontend/services/client";
import { reportError } from "../../src/app/frontend/services/errors";
import { reportSessionErrors } from "../../src/app/frontend/services/events/reporting";
import {
  captureError,
  parseError,
  stringifyError,
  type ErrorDetails,
} from "../../src/failures/details";

test("session errors are logged once until they clear", () => {
  const log = spyOn(console, "error").mockImplementation(() => undefined);
  const reported = new Set<string>();
  const failed = session(captureError(new Error("failed")));

  reportSessionErrors([failed], reported);
  reportSessionErrors([failed], reported);
  expect(log).toHaveBeenCalledTimes(1);
  expect(log).toHaveBeenCalledWith("failed", {
    sessionId: "session",
    error: failed.error,
  });

  reportSessionErrors([session(null)], reported);
  reportSessionErrors([failed], reported);
  expect(log).toHaveBeenCalledTimes(2);
  log.mockRestore();
});

test("the same error object is printed only once across reporting boundaries", () => {
  const log = spyOn(console, "error").mockImplementation(() => undefined);
  const error = new Error("failed");

  reportError(error, { path: "/api/test" });
  reportError(error);

  expect(log).toHaveBeenCalledTimes(1);
  expect(log).toHaveBeenCalledWith(error, { path: "/api/test" });
  log.mockRestore();
});

test("structured errors retain SDK fields, response headers, body and cause", () => {
  const cause = Object.assign(new Error("socket closed"), {
    code: "ECONNRESET",
  });
  const error = Object.assign(
    new Error("502 Upstream request failed", { cause }),
    {
      status: 502,
      code: "upstream_error",
      requestID: "req-123",
      headers: new Headers({ "x-request-id": "req-123" }),
      error: { type: "gateway_error", provider: "upstream" },
    },
  );

  const persisted = parseError(stringifyError(captureError(error)));
  expect(persisted).toMatchObject({
    name: "Error",
    message: "502 Upstream request failed",
    cause: {
      name: "Error",
      message: "socket closed",
      details: { code: "ECONNRESET" },
    },
    details: {
      status: 502,
      code: "upstream_error",
      requestID: "req-123",
      headers: { "x-request-id": "req-123" },
      error: { type: "gateway_error", provider: "upstream" },
    },
  });
});

test("persisted error details are validated recursively", () => {
  expect(() =>
    parseError(
      JSON.stringify({
        name: "Error",
        message: "failed",
        cause: { name: "Error", message: "cause", stack: 42 },
      }),
    ),
  ).toThrow("队列错误详情无效");

  expect(() =>
    parseError(
      JSON.stringify({
        name: "Error",
        message: "failed",
        unexpected: true,
      }),
    ),
  ).toThrow("队列错误详情无效");
});

test("non-error and circular values keep the persisted error contract", () => {
  const circular: Record<string, unknown> = {
    reason: "failed",
    omitted: undefined,
  };
  circular["self"] = circular;

  expect(parseError(stringifyError(captureError(circular)))).toMatchObject({
    name: "Object",
    message: "[object Object]",
    details: {
      value: { reason: "failed", self: "[Circular]" },
    },
  });

  expect(captureError(new Date(0))).toMatchObject({
    name: "Date",
    details: { value: "1970-01-01T00:00:00.000Z" },
  });
});

function session(error: ErrorDetails | null): SessionInfo {
  return {
    id: "session",
    workspace: "F:/workspace",
    createdAt: 1,
    updatedAt: 1,
    status: error ? "error" : "idle",
    error,
  };
}
