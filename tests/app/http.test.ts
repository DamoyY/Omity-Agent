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
  const emptyMessage = await api.request("/api/sessions/test/messages", {
    method: "POST",
    body: messageForm("   ", 0),
  });
  expect(emptyMessage.status).toBe(400);
});

test("message multipart validation forwards placeholders and files", async () => {
  const calls: unknown[] = [];
  const controller = apiController();
  controller.sendMessage = (...args: unknown[]) => {
    calls.push(args);
    return Promise.resolve({ queueId: 1, content: "attachments/file.txt" });
  };
  const id = "123e4567-e89b-42d3-a456-426614174000";
  const body = messageForm(`查看 {{file:${id}:notes.txt}}`, 3);
  body.append(`file:${id}`, new File(["hello"], "notes.txt"));

  const response = await createApi(controller).request(
    "/api/sessions/test/messages",
    { method: "POST", body },
  );

  expect(response.status).toBe(200);
  expect(calls).toHaveLength(1);
  expect(calls[0]).toMatchObject([
    "test",
    {
      content: `查看 {{file:${id}:notes.txt}}`,
      draftRevision: 3,
      attachments: [{ id, file: { name: "notes.txt", size: 5 } }],
    },
  ]);
});

test("session creation validates and forwards the complete initial state", async () => {
  const calls: unknown[] = [];
  const controller = apiController();
  controller.createSession = (...args: unknown[]) => {
    calls.push(args);
    return Promise.resolve({
      id: "new-session",
      workspace: "F:/workspace",
      createdAt: 1,
      updatedAt: 1,
      status: "idle",
      error: null,
    });
  };
  const api = createApi(controller);
  const body = sessionForm(
    "F:/workspace",
    [{ user: "旧问题", assistant: "旧回答" }],
    "新问题",
  );
  const response = await api.request("/api/sessions", {
    method: "POST",
    body,
  });
  expect(response.status).toBe(200);
  expect(calls).toEqual([
    [
      {
        workspace: "F:/workspace",
        history: [{ user: "旧问题", assistant: "旧回答" }],
        message: "新问题",
        attachments: [],
      },
    ],
  ]);

  const incompleteBody = sessionForm(
    "F:/workspace",
    [{ user: "", assistant: "回答" }],
    "新问题",
  );
  const incomplete = await api.request("/api/sessions", {
    method: "POST",
    body: incompleteBody,
  });
  expect(incomplete.status).toBe(400);
});

test("API JSON reader enforces the body size limit", async () => {
  const body = `"${"x".repeat(requestBodyLimit)}"`;
  const response = await createApi(apiController()).request(
    "/api/sessions/test/control",
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
  expect(
    normalizeError(
      new DomainError("ATTACHMENT_TOO_LARGE", "附件总大小超过上限"),
    ),
  ).toMatchObject({ status: 413, code: "ATTACHMENT_TOO_LARGE" });
});

function jsonRequest(body: unknown): RequestInit {
  return { method: "POST", body: JSON.stringify(body) };
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

function apiController() {
  return {
    bootstrap: () => ({
      attachments: { allowedSuffixes: [".txt"], maxSizeBytes: 1024 },
    }),
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
