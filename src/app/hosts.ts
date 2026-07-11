import { runHostSession, type HostMode } from "../host";
import { AppEvents } from "./events";

interface RunningHost {
  root: string;
  controller: AbortController;
  done: Promise<void>;
}

export class AppHosts {
  private readonly running = new Map<string, RunningHost>();
  private readonly errors = new Map<string, string>();

  constructor(
    private readonly appRoot: string,
    private readonly events: AppEvents,
  ) {}

  has(sessionId: string) {
    return this.running.has(sessionId);
  }

  error(sessionId: string) {
    return this.errors.get(sessionId) ?? null;
  }

  clearError(sessionId: string) {
    this.errors.delete(sessionId);
  }

  ensure(sessionId: string, root: string) {
    if (!this.running.has(sessionId)) this.start(sessionId, root, "load");
  }

  start(sessionId: string, root: string, kind: HostMode["kind"]) {
    if (this.running.has(sessionId)) return;
    const controller = new AbortController();
    const done = runHostSession({ kind, sessionId }, this.appRoot, {
      controller,
      cwd: root,
      quiet: true,
      wake: (delayMs) => this.events.wait(sessionId, delayMs),
      observer: {
        changed: (changedSessionId) => {
          this.events.notify(changedSessionId);
        },
        token: () => undefined,
      },
    })
      .catch((error: unknown) => {
        this.errors.set(
          sessionId,
          error instanceof Error ? error.message : String(error),
        );
      })
      .finally(() => {
        if (this.running.get(sessionId)?.controller === controller) {
          this.running.delete(sessionId);
        }
      });
    this.running.set(sessionId, { root, controller, done });
  }

  async stop(sessionId: string) {
    const host = this.running.get(sessionId);
    if (!host) return;
    host.controller.abort(new Error("App 请求停止 Host"));
    this.events.notify(sessionId);
    await host.done;
  }

  async close() {
    const hosts = [...this.running.entries()];
    for (const [sessionId, host] of hosts) {
      host.controller.abort(new Error("App 正在关闭"));
      this.events.notify(sessionId);
    }
    await Promise.all(hosts.map(([, host]) => host.done));
  }
}
