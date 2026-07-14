import { type ApiController, createApi } from "../../src/app/http/handler";
import { expect, test } from "bun:test";
import { AppEvents } from "../../src/app/events";
test("tool cancellation validates and forwards the tool call ID", async () => {
  const calls: unknown[] = [];
  const controller = {
    bootstrap: () => ({
      attachments: { allowedSuffixes: [".txt"], maxSizeBytes: 1024 },
    }),
    cancelTool: (...args: unknown[]) => {
      calls.push(args);
      return Promise.resolve({ toolCallId: "call-1" });
    },
    events: new AppEvents(),
  } as unknown as ApiController;
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
