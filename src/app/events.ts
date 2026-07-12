import { setTimeout as sleep } from "node:timers/promises";
import type { Context } from "hono";
import { streamSSE } from "hono/streaming";
import mitt from "mitt";

type Events = Record<"changed" | "sessions", string>;

export class AppEvents {
  private readonly bus = mitt<Events>();

  notify(sessionId: string) {
    this.bus.emit("changed", sessionId);
    this.bus.emit("sessions", sessionId);
  }

  notifyTranscript(sessionId: string) {
    this.bus.emit("changed", sessionId);
  }

  wait(sessionId: string, delayMs: number) {
    return new Promise<void>((resolve) => {
      let settled = false;
      const handler = (changedSessionId: string) => {
        if (changedSessionId !== sessionId) return;
        done();
      };
      const done = () => {
        if (settled) return;
        settled = true;
        this.bus.off("changed", handler);
        resolve();
      };
      this.bus.on("changed", handler);
      void sleep(delayMs).then(done);
    });
  }

  stream(c: Context, sessionId?: string) {
    const response = streamSSE(c, async (stream) => {
      await stream.writeSSE(changedEvent);
      const event = sessionId ? "changed" : "sessions";
      let pending = Promise.resolve();
      let rejectStream: (error: unknown) => void = () => undefined;
      const abort = () => {
        resolveStream();
      };
      let resolveStream: () => void = () => undefined;
      const handler = (changedSessionId: string) => {
        if (sessionId && changedSessionId !== sessionId) return;
        pending = pending.then(() => stream.writeSSE(changedEvent));
        void pending.catch(rejectStream);
      };
      try {
        await new Promise<void>((resolve, reject) => {
          resolveStream = resolve;
          rejectStream = reject;
          this.bus.on(event, handler);
          if (c.req.raw.signal.aborted) resolve();
          else
            c.req.raw.signal.addEventListener("abort", abort, {
              once: true,
            });
        });
        await pending;
      } finally {
        this.bus.off(event, handler);
        c.req.raw.signal.removeEventListener("abort", abort);
      }
    });
    response.headers.set("content-type", "text/event-stream; charset=utf-8");
    return response;
  }
}

const changedEvent = { event: "changed", data: "{}" } as const;
