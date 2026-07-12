import { expect, spyOn, test } from "bun:test";
import type { SessionInfo } from "../../src/app/frontend/services/client";
import { reportError } from "../../src/app/frontend/services/errors";
import { reportSessionErrors } from "../../src/app/frontend/services/sessionErrors";

test("session errors are logged once until they clear", () => {
  const log = spyOn(console, "error").mockImplementation(() => undefined);
  const reported = new Set<string>();
  const failed = session("failed");

  reportSessionErrors([failed], reported);
  reportSessionErrors([failed], reported);
  expect(log).toHaveBeenCalledTimes(1);
  expect(log).toHaveBeenCalledWith("failed", {
    sessionId: "session",
    error: "failed",
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

function session(error: string | null): SessionInfo {
  return {
    id: "session",
    workspace: "F:/workspace",
    createdAt: 1,
    updatedAt: 1,
    status: error ? "error" : "idle",
    error,
  };
}
