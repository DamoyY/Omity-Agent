import { runHostSession, type HostMode } from "../host";
import type { SessionStatus } from "../types";
import { captureError, type ErrorDetails } from "../failures/details";
import type { StreamEvent } from "../infrastructure/database/records/streamEvents";

type HostActivity = Extract<SessionStatus, "tool" | "model" | "idle">;

interface RunningHost {
  root: string;
  controller: AbortController;
  done: Promise<void>;
  activity: HostActivity;
}

export interface AppHostEvents {
  activity(sessionId: string): void;
  changed(sessionId: string): void;
  transcript(sessionId: string, event: StreamEvent): void;
  wait(sessionId: string, delayMs: number): Promise<void>;
}

export class AppHosts {
  private readonly running = new Map<string, RunningHost>();
  private readonly errors = new Map<string, ErrorDetails>();
  private closing = false;

  constructor(
    private readonly appRoot: string,
    private readonly events: AppHostEvents,
  ) {}

  has(sessionId: string) {
    return this.running.has(sessionId);
  }

  error(sessionId: string) {
    return this.errors.get(sessionId) ?? null;
  }

  activity(sessionId: string): HostActivity {
    return this.running.get(sessionId)?.activity ?? "idle";
  }

  clearError(sessionId: string) {
    this.errors.delete(sessionId);
  }

  ensure(sessionId: string, root: string) {
    if (!this.running.has(sessionId)) this.start(sessionId, root, "load");
  }

  start(sessionId: string, root: string, kind: HostMode["kind"]) {
    if (this.closing) throw new Error("App 正在关闭，不能启动 Host");
    if (this.running.has(sessionId)) return;
    this.errors.delete(sessionId);
    const controller = new AbortController();
    const done = runHostSession({ kind, sessionId }, this.appRoot, {
      controller,
      cwd: root,
      quiet: true,
      wake: (delayMs) => this.events.wait(sessionId, delayMs),
      observer: {
        activity: (changedSessionId, activity) => {
          const host = this.running.get(changedSessionId);
          if (host?.controller !== controller) return;
          if (host.activity === activity) return;
          host.activity = activity;
          this.events.activity(changedSessionId);
        },
        changed: (changedSessionId) => {
          this.events.changed(changedSessionId);
        },
        transcript: (changedSessionId, event) => {
          this.events.transcript(changedSessionId, event);
        },
        token: () => undefined,
      },
    })
      .catch((error: unknown) => {
        this.errors.set(sessionId, captureError(error));
      })
      .finally(() => {
        if (this.running.get(sessionId)?.controller === controller) {
          this.running.delete(sessionId);
        }
        this.events.changed(sessionId);
      });
    this.running.set(sessionId, {
      root,
      controller,
      done,
      activity: "idle",
    });
  }

  async stop(sessionId: string) {
    const host = this.running.get(sessionId);
    if (!host) return;
    host.controller.abort(new Error("App 请求停止 Host"));
    this.events.changed(sessionId);
    await host.done;
  }

  async close() {
    this.closing = true;
    const hosts = [...this.running.entries()];
    for (const [sessionId, host] of hosts) {
      host.controller.abort(new Error("App 正在关闭"));
      this.events.changed(sessionId);
    }
    await Promise.all(hosts.map(([, host]) => host.done));
  }
}
