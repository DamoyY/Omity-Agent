import { expect, test } from "bun:test";
import {
  isModelNetworkError,
  modelNetworkRetryDelayMs,
} from "../src/runtime/network";

test("detects retryable model network errors", () => {
  expect(isModelNetworkError(new Error("fetch failed"))).toBe(true);
  expect(isModelNetworkError({ code: "ECONNRESET" })).toBe(true);
  expect(isModelNetworkError({ name: "TimeoutError" })).toBe(true);
  expect(isModelNetworkError({ cause: { code: "ENOTFOUND" } })).toBe(true);
});

test("does not retry user abort or API validation errors", () => {
  expect(isModelNetworkError({ name: "AbortError" })).toBe(false);
  expect(isModelNetworkError({ status: 400, message: "invalid request" })).toBe(
    false,
  );
});

test("model network retry delay grows with a cap", () => {
  expect(modelNetworkRetryDelayMs(1)).toBe(1_000);
  expect(modelNetworkRetryDelayMs(2)).toBe(2_000);
  expect(modelNetworkRetryDelayMs(99)).toBe(30_000);
});
