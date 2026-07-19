import { type ApiController, createApi } from "../../src/app/http/handler";
import { DomainError, sessionNotFound } from "../../src/errors";
import { decodeSessionId, requestBodyLimit } from "../../src/app/http/request";
import { expect, test } from "bun:test";
import { createApiController } from "./support/apiController";
import { createStaticApp } from "../../src/app/http/static";
import { normalizeError } from "../../src/app/http/errors";

test("API JSON validation rejects invalid controls and empty messages", async () => {
  const api = createApi(createApiController());
  const invalidControl = await api.request(
    "/api/sessions/test/control",
    jsonRequest({ control: "invalid" }),
  );
  expect(invalidControl.status).toBe(400);
  expect(await invalidControl.json()).toMatchObject({
    error: { code: "BAD_REQUEST" },
  });
  const emptyMessage = await api.request("/api/sessions/test/messages", {
    body: messageForm("   ", 0),
    method: "POST",
  });
  expect(emptyMessage.status).toBe(400);
});
test("message multipart validation forwards placeholders and files", async () => {
  const calls: Parameters<ApiController["sendMessage"]>[] = [];
  const controller = createApiController({
    sendMessage: (...args) => {
      calls.push(args);
      return Promise.resolve({ content: "attachments/file.txt", queueId: 1 });
    },
  });
  const id = "a1b2c3d4";
  const body = messageForm(`查看 {{file:${id}:notes.txt}}`, 3);
  body.append(`file:${id}`, new File(["hello"], "notes.txt"));
  const response = await createApi(controller).request("/api/sessions/test/messages", {
    body,
    method: "POST",
  });
  expect(response.status).toBe(200);
  expect(calls).toHaveLength(1);
  expect(calls[0]).toMatchObject([
    "test",
    {
      attachments: [{ file: { name: "notes.txt", size: 5 }, id }],
      content: `查看 {{file:${id}:notes.txt}}`,
      draftRevision: 3,
    },
  ]);
});
test("multipart attachments without filenames are rejected", async () => {
  const calls: Parameters<ApiController["sendMessage"]>[] = [];
  const controller = createApiController({
    sendMessage: (...args) => {
      calls.push(args);
      return Promise.resolve({ content: "unused", queueId: 1 });
    },
  });
  const boundary = "attachment-test-boundary";
  const body = [
    `--${boundary}`,
    'Content-Disposition: form-data; name="content"',
    "",
    "查看附件",
    `--${boundary}`,
    'Content-Disposition: form-data; name="draftRevision"',
    "",
    "0",
    `--${boundary}`,
    'Content-Disposition: form-data; name="file:a1b2c3d4"; filename=""',
    "Content-Type: text/plain",
    "",
    "hello",
    `--${boundary}--`,
    "",
  ].join("\r\n");
  const response = await createApi(controller).request("/api/sessions/test/messages", {
    body,
    headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
    method: "POST",
  });
  expect(response.status).toBe(400);
  expect(await response.json()).toEqual({
    error: {
      code: "BAD_REQUEST",
      message: "附件缺少有效文件名：file:a1b2c3d4",
    },
  });
  expect(calls).toHaveLength(0);
});
test("session creation validates and forwards the complete initial state", async () => {
  const calls: Parameters<ApiController["createSession"]>[] = [];
  const controller = createApiController({
    createSession: (...args) => {
      calls.push(args);
      return Promise.resolve({
        createdAt: 1,
        error: null,
        id: "new-session",
        status: "idle",
        updatedAt: 1,
        workspace: "F:/workspace",
      });
    },
  });
  const api = createApi(controller);
  const body = sessionForm("F:/workspace", [{ assistant: "旧回答", user: "旧问题" }], "新问题");
  const response = await api.request("/api/sessions", {
    body,
    method: "POST",
  });
  expect(response.status).toBe(200);
  expect(calls).toEqual([
    [
      {
        attachments: [],
        history: [{ assistant: "旧回答", user: "旧问题" }],
        message: "新问题",
        workspace: "F:/workspace",
      },
    ],
  ]);
  const incompleteBody = sessionForm("F:/workspace", [{ assistant: "回答", user: "" }], "新问题");
  const incomplete = await api.request("/api/sessions", {
    body: incompleteBody,
    method: "POST",
  });
  expect(incomplete.status).toBe(400);
});
test("API JSON reader enforces the body size limit", async () => {
  const body = `"${"x".repeat(requestBodyLimit)}"`;
  const response = await createApi(createApiController()).request("/api/sessions/test/control", {
    body,
    method: "POST",
  });
  expect(response.status).toBe(413);
  expect(await response.json()).toEqual({
    error: {
      code: "PAYLOAD_TOO_LARGE",
      message: `请求体不能超过 ${requestBodyLimit.toString()} 字节`,
    },
  });
});
test("API returns the existing JSON 404 contract", async () => {
  const response = await createApi(createApiController()).request("/api/unknown");
  expect(response.status).toBe(404);
  expect(await response.json()).toEqual({
    error: { code: "NOT_FOUND", message: "未知 API：/api/unknown" },
  });
});
test("API validates encoded session IDs without path normalization", () => {
  expect(decodeSessionId("web-123")).toBe("web-123");
  expect(() => decodeSessionId("abc%2Fdef")).toThrow("路径 ID 无效");
  expect(() => decodeSessionId("%E0%A4%A")).toThrow("Session ID 编码无效");
});
test("API maps missing sessions and conflicts to explicit status codes", () => {
  expect(normalizeError(sessionNotFound("123"))).toMatchObject({
    code: "SESSION_NOT_FOUND",
    status: 404,
  });
  expect(
    normalizeError(new DomainError("HOST_LEASE_CONFLICT", "会话已有 Host 正在运行：123")),
  ).toMatchObject({
    code: "HOST_LEASE_CONFLICT",
    status: 409,
  });
  expect(normalizeError(new Error("会话不存在：文案不再参与映射"))).toMatchObject({
    code: "INTERNAL_ERROR",
    message: "会话不存在：文案不再参与映射",
    status: 500,
  });
  expect(
    normalizeError(new DomainError("ATTACHMENT_TOO_LARGE", "附件总大小超过上限")),
  ).toMatchObject({ code: "ATTACHMENT_TOO_LARGE", status: 413 });
});
test("static frontend permits remote Markdown images", async () => {
  const response = await createStaticApp(".").request("/missing");
  expect(response.headers.get("content-security-policy")).toContain(
    "img-src 'self' data: blob: https: http:",
  );
});
function jsonRequest(body: unknown): RequestInit {
  return { body: JSON.stringify(body), method: "POST" };
}
function messageForm(content: string, draftRevision: number) {
  const body = new FormData();
  body.set("content", content);
  body.set("draftRevision", draftRevision.toString());
  return body;
}
function sessionForm(
  workspace: string,
  history: { user: string; assistant: string }[],
  message: string,
) {
  const body = new FormData();
  body.set("workspace", workspace);
  body.set("history", JSON.stringify(history));
  body.set("message", message);
  return body;
}
