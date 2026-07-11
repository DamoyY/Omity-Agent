import { Readable } from "node:stream";
import { expect, test } from "bun:test";
import { HttpError, normalizeError } from "../src/app/http/errors";
import {
  controlBody,
  decodeSessionId,
  messageBody,
  readJson,
  requestBodyLimit,
} from "../src/app/http/request";

test("API JSON validation rejects invalid controls and empty messages", async () => {
  await expect(
    readJson(request({ control: "invalid" }), controlBody),
  ).rejects.toMatchObject({
    status: 400,
  });
  await expect(
    readJson(request({ content: "   " }), messageBody),
  ).rejects.toMatchObject({
    status: 400,
  });
});

test("API JSON reader enforces the body size limit", async () => {
  const body = `"${"x".repeat(requestBodyLimit)}"`;
  await expect(readJson(rawRequest(body), messageBody)).rejects.toMatchObject({
    status: 413,
  });
});

test("API validates encoded session IDs without path normalization", () => {
  expect(decodeSessionId("web-123")).toBe("web-123");
  expect(() => decodeSessionId("abc%2Fdef")).toThrow("路径 ID 无效");
  expect(() => decodeSessionId("%E0%A4%A")).toThrow("Session ID 编码无效");
});

test("API maps missing sessions and conflicts to explicit status codes", () => {
  expect(normalizeError(new Error("会话不存在：123"))).toMatchObject({
    status: 404,
  });
  expect(
    normalizeError(new Error("会话已有 Host 正在运行：123")),
  ).toMatchObject({
    status: 409,
  });
  expect(normalizeError(new HttpError(413, "too large"))).toMatchObject({
    status: 413,
  });
});

function request(body: unknown) {
  return rawRequest(JSON.stringify(body));
}

function rawRequest(body: string) {
  return Object.assign(Readable.from([body]), {
    headers: {},
  }) as never;
}
