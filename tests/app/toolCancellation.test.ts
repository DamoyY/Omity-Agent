import { expect, test } from "bun:test";
import { AppEvents } from "../../src/app/events";
import { createApi, type ApiController } from "../../src/app/http/handler";

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
    method: "POST",
    body: JSON.stringify({ toolCallId: "call-1" }),
  });
  expect(response.status).toBe(200);
  expect(calls).toEqual([["test", "call-1"]]);

  const invalid = await api.request("/api/sessions/test/tools/cancel", {
    method: "POST",
    body: JSON.stringify({ toolCallId: "" }),
  });
  expect(invalid.status).toBe(400);
});
