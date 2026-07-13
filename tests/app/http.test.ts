import { expect, test } from "bun:test";
import { AppEvents } from "../../src/app/events";
import { normalizeError } from "../../src/app/http/errors";
import { createApi, type ApiController } from "../../src/app/http/handler";
import { decodeSessionId, requestBodyLimit } from "../../src/app/http/request";
import { DomainError, sessionNotFound } from "../../src/errors";

test("API JSON validation rejects invalid controls and empty messages", async () => {
  const api = createApi(apiController());
  const invalidControl = await api.request(
    "/api/sessions/test/control",
    jsonRequest({ control: "invalid" }),
  );
  expect(invalidControl.status).toBe(400);
  expect(await invalidControl.json()).toMatchObject({
    error: { code: "BAD_REQUEST" },
  });
  const emptyMessage = await api.request(
    "/api/sessions/test/messages",
    jsonRequest({ content: "   " }),
  );
  expect(emptyMessage.status).toBe(400);
});

test("session creation validates and forwards the complete initial state", async () => {
  const calls: unknown[] = [];
  const controller = apiController();
  controller.createSession = (...args: unknown[]) => {
    calls.push(args);
    return {
      id: "new-session",
      workspace: "F:/workspace",
      createdAt: 1,
      updatedAt: 1,
      status: "idle",
      error: null,
    };
  };
  const api = createApi(controller);
  const body = {
    workspace: "F:/workspace",
    history: [{ user: "旧问题", assistant: "旧回答" }],
    message: "新问题",
  };
  const response = await api.request("/api/sessions", jsonRequest(body));
  expect(response.status).toBe(200);
  expect(calls).toEqual([[body.workspace, body.history, body.message]]);

  const incomplete = await api.request(
    "/api/sessions",
    jsonRequest({ ...body, history: [{ user: "", assistant: "回答" }] }),
  );
  expect(incomplete.status).toBe(400);
});

test("API JSON reader enforces the body size limit", async () => {
  const body = `"${"x".repeat(requestBodyLimit)}"`;
  const response = await createApi(apiController()).request(
    "/api/sessions/test/messages",
    { method: "POST", body },
  );
  expect(response.status).toBe(413);
  expect(await response.json()).toEqual({
    error: {
      code: "PAYLOAD_TOO_LARGE",
      message: `请求体不能超过 ${requestBodyLimit.toString()} 字节`,
    },
  });
});

test("API returns the existing JSON 404 contract", async () => {
  const response = await createApi(apiController()).request("/api/unknown");
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
    status: 404,
    code: "SESSION_NOT_FOUND",
  });
  expect(
    normalizeError(
      new DomainError("HOST_LEASE_CONFLICT", "会话已有 Host 正在运行：123"),
    ),
  ).toMatchObject({
    status: 409,
    code: "HOST_LEASE_CONFLICT",
  });
  expect(
    normalizeError(new Error("会话不存在：文案不再参与映射")),
  ).toMatchObject({
    status: 500,
    code: "INTERNAL_ERROR",
    message: "会话不存在：文案不再参与映射",
  });
});

function jsonRequest(body: unknown): RequestInit {
  return { method: "POST", body: JSON.stringify(body) };
}

function apiController() {
  return {
    bootstrap: () => ({}),
    sessions: () => [],
    pickWorkspace: () => null,
    createSession: () => ({}),
    deleteSession: () => ({}),
    transcript: () => ({}),
    composerDraft: () => ({}),
    saveComposerDraft: () => ({}),
    sendMessage: () => ({}),
    control: () => ({}),
    forkSession: () => ({}),
    assertSession: () => undefined,
    events: new AppEvents(),
  } as unknown as ApiController;
}
