import { type ApiController, createApi } from "../../src/app/http/handler";
import { expect, test } from "bun:test";
import { createApiController } from "./support/apiController";
test("tool cancellation validates and forwards the tool call ID", async () => {
  const calls: Parameters<ApiController["cancelTool"]>[] = [];
  const controller = createApiController({
    cancelTool: (...args) => {
      calls.push(args);
      return { toolCallId: "call-1" };
    },
  });
  const api = createApi(controller);
  const response = await api.request("/api/sessions/test/tools/cancel", {
    body: JSON.stringify({ toolCallId: "call-1" }),
    method: "POST",
  });
  expect(response.status).toBe(200);
  expect(calls).toEqual([["test", "call-1"]]);
  const invalid = await api.request("/api/sessions/test/tools/cancel", {
    body: JSON.stringify({ toolCallId: "" }),
    method: "POST",
  });
  expect(invalid.status).toBe(400);
});
