import { type ErrorDetails, captureError } from "../failures/details";
import type { HostMode, SessionStatus } from "../types";
import type { ProcessOwner } from "../infrastructure/process/ownership";
import type { StreamEvent } from "../infrastructure/database/records/streamEvents";
import { runHostSession } from "../host";
type HostActivity = Extract<SessionStatus, "tool" | "model" | "idle">;
interface RunningHost {
  activity: HostActivity;
  done: Promise<void>;
  force: AbortController;
  ready: Promise<void>;
  stopping: AbortController;
  cancelTool(callId: string): boolean;
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
    private readonly owner: ProcessOwner,
    private readonly shutdownTimeoutMs: number,
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
    return this.running.get(sessionId)?.ready ?? this.start(sessionId, root, "load");
  }
  start(sessionId: string, root: string, kind: HostMode["kind"]) {
    if (this.closing) {
      return Promise.reject(new Error("App 正在关闭，不能启动 Host"));
    }
    const existing = this.running.get(sessionId);
    if (existing) {
      return existing.ready;
    }
    this.errors.delete(sessionId);
    const force = new AbortController();
    const stopping = new AbortController();
    const ready = Promise.withResolvers<undefined>();
    let initialized = false;
    let cancelTool: RunningHost["cancelTool"] = () => false;
    const hostPromise = runHostSession({ kind, sessionId }, this.appRoot, {
      controller: force,
      cwd: root,
      observer: this.observer(force),
      onReady: (controls) => {
        cancelTool = (callId) => controls.cancelTool(callId);
        initialized = true;
        ready.resolve(undefined);
      },
      owner: this.owner,
      quiet: true,
      stoppingController: stopping,
      wake: (delayMs) => this.events.wait(sessionId, delayMs),
    });
    const done = hostPromise
      .catch((error: unknown) => {
        this.errors.set(sessionId, captureError(error));
        if (!initialized) {
          ready.reject(error);
        }
      })
      .finally(() => {
        if (this.running.get(sessionId)?.force === force) {
          this.running.delete(sessionId);
        }
        this.events.changed(sessionId);
      });
    this.running.set(sessionId, {
      activity: "idle",
      cancelTool: (callId) => cancelTool(callId),
      done,
      force,
      ready: ready.promise,
      stopping,
    });
    return ready.promise;
  }
  cancelTool(sessionId: string, callId: string) {
    const host = this.running.get(sessionId);
    return host?.cancelTool(callId) ?? false;
  }
  async stop(sessionId: string) {
    const host = this.running.get(sessionId);
    if (!host) {
      return;
    }
    host.force.abort(new Error("App 请求停止 Host"));
    this.events.changed(sessionId);
    await host.done;
  }
  async close() {
    this.closing = true;
    const hosts = [...this.running.entries()];
    for (const [sessionId, host] of hosts) {
      host.stopping.abort(new Error("App 正在关闭"));
      this.events.changed(sessionId);
    }
    await Promise.all(hosts.map(([, host]) => this.stopAtDeadline(host)));
  }
  private observer(force: AbortController) {
    return {
      activity: (changedSessionId: string, activity: HostActivity) => {
        const host = this.running.get(changedSessionId);
        if (host?.force !== force || host.activity === activity) {
          return;
        }
        host.activity = activity;
        this.events.activity(changedSessionId);
      },
      changed: (changedSessionId: string) => {
        this.events.changed(changedSessionId);
      },
      token: () => undefined,
      transcript: (changedSessionId: string, event: StreamEvent) => {
        this.events.transcript(changedSessionId, event);
      },
    };
  }
  private async stopAtDeadline(host: RunningHost) {
    const stopped = await Promise.race([
      host.done.then(() => true),
      Bun.sleep(this.shutdownTimeoutMs).then(() => false),
    ]);
    if (!stopped) {
      host.force.abort(new Error("Host 未在关闭期限内到达恢复边界"));
    }
    await host.done;
  }
}
