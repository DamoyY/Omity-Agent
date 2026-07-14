import type { Context } from "hono";
import type { DisplayEvent } from "./timeline";
import type { SessionInfo } from "./sessionState";
import mitt from "mitt";
import { setTimeout as sleep } from "node:timers/promises";
import { streamSSE } from "hono/streaming";
interface TranscriptDelta {
  sessionId: string;
  event: DisplayEvent;
}
interface Events {
  [key: string]: unknown;
  [key: symbol]: unknown;
  deleted: string;
  session: SessionInfo;
  transcriptChanged: string;
  transcriptDelta: TranscriptDelta;
  wake: string;
}
type WriteEvent = (event: string, data: unknown) => void;
export class AppEvents {
  private readonly bus = mitt<Events>();
  notifySession(session: SessionInfo) {
    this.bus.emit("session", session);
  }
  notifyDeleted(sessionId: string) {
    this.bus.emit("deleted", sessionId);
  }
  invalidateTranscript(sessionId: string) {
    this.bus.emit("transcriptChanged", sessionId);
  }
  notifyTranscript(sessionId: string, event: DisplayEvent) {
    this.bus.emit("transcriptDelta", { event, sessionId });
  }
  wake(sessionId: string) {
    this.bus.emit("wake", sessionId);
  }
  wait(sessionId: string, delayMs: number) {
    return new Promise<void>((resolve) => {
      let settled = false;
      const handler = (changedSessionId: string) => {
        if (changedSessionId !== sessionId) {
          return;
        }
        done();
      };
      const done = () => {
        if (settled) {
          return;
        }
        settled = true;
        this.bus.off("wake", handler);
        resolve();
      };
      this.bus.on("wake", handler);
      void (async () => {
        await sleep(delayMs);
        done();
      })();
    });
  }
  streamSessions(c: Context, getSessions: () => SessionInfo[]) {
    return this.stream(c, (write) => {
      const session = (value: SessionInfo) => {
        write("session", value);
      };
      const deleted = (sessionId: string) => {
        write("deleted", { sessionId });
      };
      this.bus.on("session", session);
      this.bus.on("deleted", deleted);
      write("sessions", { sessions: getSessions() });
      return () => {
        this.bus.off("session", session);
        this.bus.off("deleted", deleted);
      };
    });
  }
  streamTranscript(c: Context, sessionId: string) {
    return this.stream(c, (write) => {
      const changed = (changedSessionId: string) => {
        if (changedSessionId === sessionId) {
          write("changed", {});
        }
      };
      const delta = (value: TranscriptDelta) => {
        if (value.sessionId === sessionId) {
          write("delta", value.event);
        }
      };
      this.bus.on("transcriptChanged", changed);
      this.bus.on("transcriptDelta", delta);
      write("changed", {});
      return () => {
        this.bus.off("transcriptChanged", changed);
        this.bus.off("transcriptDelta", delta);
      };
    });
  }
  private stream(c: Context, subscribe: (write: WriteEvent) => () => void) {
    const response = streamSSE(c, async (stream) => {
      let pending = Promise.resolve();
      let resolveStream: () => void = () => undefined;
      let rejectStream: (error: unknown) => void = () => undefined;
      const disconnected = new Promise<void>((resolve, reject) => {
        resolveStream = resolve;
        rejectStream = reject;
      });
      const write: WriteEvent = (event, data) => {
        pending = writePending(pending, stream, event, data);
        void observePending(pending, rejectStream);
      };
      const unsubscribe = subscribe(write);
      const abort = () => {
        resolveStream();
      };
      try {
        if (c.req.raw.signal.aborted) {
          resolveStream();
        } else {
          c.req.raw.signal.addEventListener("abort", abort, { once: true });
        }
        await disconnected;
        await pending;
      } finally {
        unsubscribe();
        c.req.raw.signal.removeEventListener("abort", abort);
      }
    });
    response.headers.set("content-type", "text/event-stream; charset=utf-8");
    return response;
  }
}
async function writePending(
  previous: Promise<void>,
  stream: Parameters<Parameters<typeof streamSSE>[1]>[0],
  event: string,
  data: unknown,
) {
  await previous;
  await stream.writeSSE({ data: JSON.stringify(data), event });
}
async function observePending(promise: Promise<void>, reject: (error: unknown) => void) {
  try {
    await promise;
  } catch (error: unknown) {
    reject(error);
  }
}
