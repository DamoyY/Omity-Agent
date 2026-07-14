import {
  ModelEmptyResponseError,
  isModelNetworkError,
  modelNetworkRetryDelayMs,
} from "../../src/runtime/network";
import { expect, mock, spyOn, test } from "bun:test";
import type { HostContext } from "../../src/runtime/context";
import type { QueueItem } from "../../src/types";
import { buildModel } from "../../src/agent/model";
import { captureError } from "../../src/failures/details";
import { parseModelSettings } from "../../src/infrastructure/configuration/settingsSchema";
import { testSettings } from "../support/settings";
import { waitBeforeModelNetworkRetry } from "../../src/runtime/retry";
test("detects retryable model network errors", () => {
  expect(isModelNetworkError(new TypeError("fetch failed"))).toBe(true);
  expect(isModelNetworkError({ code: "ECONNRESET" })).toBe(true);
  expect(isModelNetworkError({ name: "TimeoutError" })).toBe(true);
  expect(isModelNetworkError({ cause: { code: "ENOTFOUND" } })).toBe(true);
  expect(isModelNetworkError({ code: "stream_read_error" })).toBe(true);
  expect(isModelNetworkError(new ModelEmptyResponseError())).toBe(true);
  expect(isModelNetworkError({ name: "AbortError" })).toBe(false);
});
test("does not guess network failures from broad error messages", () => {
  expect(isModelNetworkError(new Error("fetch failed"))).toBe(false);
  expect(isModelNetworkError(new Error("network policy rejected request"))).toBe(false);
  expect(isModelNetworkError(new Error("Unexpected EOF"))).toBe(false);
  expect(isModelNetworkError(new Error("Received empty response from chat model call."))).toBe(
    false,
  );
});
test("model network retry delay grows with a cap", () => {
  expect(modelNetworkRetryDelayMs(1)).toBe(1000);
  expect(modelNetworkRetryDelayMs(2)).toBe(2000);
  expect(modelNetworkRetryDelayMs(99)).toBe(30_000);
});
test("model clients disable dependency network retries", () => {
  const previousKey = process.env["TEST_KEY"];
  process.env["TEST_KEY"] = "test-key";
  try {
    const model = buildModel(testSettings("data"), "session-1");
    const internals = model as unknown as {
      caller: { maxRetries: number };
      clientConfig: { maxRetries: number };
    };
    expect(internals.caller.maxRetries).toBe(0);
    expect(internals.clientConfig.maxRetries).toBe(0);
  } finally {
    if (previousKey === undefined) {
      Reflect.deleteProperty(process.env, "TEST_KEY");
    } else {
      process.env["TEST_KEY"] = previousKey;
    }
  }
});
test("model settings reject dependency retry configuration", () => {
  expect(() =>
    parseModelSettings({
      profile: "test",
      profiles: {
        test: {
          adapter: "codex",
          maxRetries: 1,
          model: "test",
          timeoutMs: 1000,
        },
      },
    }),
  ).toThrow("Unrecognized key");
});
test("warns on every model network error even when the host is stopping", async () => {
  const warn = spyOn(console, "warn").mockImplementation(() => undefined);
  const stop = mock(() => undefined);
  const controller = new AbortController();
  controller.abort();
  const error = { code: "stream_read_error" };
  const item: QueueItem = {
    content: "test",
    id: 42,
    root: true,
    runId: null,
    status: "running",
    userMessageId: 1,
  };
  try {
    const shouldRetry = await waitBeforeModelNetworkRetry(
      { controller } as HostContext,
      { items: [item] },
      error,
      1,
      {
        cancel: () => Promise.resolve(),
        pause: () => Promise.resolve(false),
        stop,
      },
    );
    expect(shouldRetry).toBe(false);
    expect(stop).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith("模型 API 网络异常，将继续重试", {
      attempt: 1,
      delayMs: 1000,
      error: captureError(error),
      queueId: 42,
    });
  } finally {
    warn.mockRestore();
  }
});
