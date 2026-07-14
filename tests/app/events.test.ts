import { expect, test } from "bun:test";
import { createApi } from "../../src/app/http/handler";
import { createApiController } from "./support/apiController";

test("global SSE starts with a full session snapshot and sends mutations", async () => {
  const abort = new AbortController();
  const controller = createApiController();
  const response = await createApi(controller).request("/api/events", {
    signal: abort.signal,
  });
  expect(response.headers.get("content-type")).toBe("text/event-stream; charset=utf-8");
  const frames = sseFrames(response);
  expect(await frames.next()).toBe('event: sessions\ndata: {"sessions":[]}\n\n');
  const session = {
    createdAt: 1,
    error: null,
    id: "test",
    status: "model" as const,
    updatedAt: 2,
    workspace: "F:/workspace",
  };
  controller.events.notifySession(session);
  expect(await frames.next()).toBe(`event: session\ndata: ${JSON.stringify(session)}\n\n`);
  controller.events.notifyDeleted("test");
  expect(await frames.next()).toBe('event: deleted\ndata: {"sessionId":"test"}\n\n');
  abort.abort();
  await frames.cancel();
});
test("session SSE sends ordered deltas only for the target session", async () => {
  const abort = new AbortController();
  const controller = createApiController();
  const response = await createApi(controller).request("/api/sessions/test/events", {
    signal: abort.signal,
  });
  const frames = sseFrames(response);
  expect(await frames.next()).toBe("event: changed\ndata: {}\n\n");
  const event = {
    id: 3,
    message: "assistant_text_delta",
    payload: { kind: "assistant_text_delta", queueId: 1, text: "hello" },
  };
  controller.events.notifyTranscript("other", { ...event, id: 2 });
  controller.events.notifyTranscript("test", event);
  expect(await frames.next()).toBe(`event: delta\ndata: ${JSON.stringify(event)}\n\n`);
  abort.abort();
  await frames.cancel();
});
function sseFrames(response: Response) {
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("SSE 响应缺少 body");
  }
  const decoder = new TextDecoder();
  let buffer = "";
  return {
    cancel: () => reader.cancel(),
    async next() {
      for (;;) {
        const boundary = buffer.indexOf("\n\n");
        if (boundary !== -1) {
          const frame = buffer.slice(0, boundary + 2);
          buffer = buffer.slice(boundary + 2);
          return frame;
        }
        const chunk = await reader.read();
        if (chunk.done) {
          throw new Error("SSE 在下一帧前结束");
        }
        buffer += decoder.decode(chunk.value, { stream: true });
      }
    },
  };
}
