import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { runClient } from "../client";
import { deleteHostSession, runHostSession } from "../host";
import { loadSettings, resolveSessionPaths } from "../infrastructure/config";
import { AgentDatabase } from "../infrastructure/database";
import type { Control } from "../types";
import { AppEvents } from "./events";
import { AppRegistry } from "./registry";
import { loadTranscript } from "./transcript";
import { pickWorkspaceDirectory } from "./workspacePicker";

type RunningHost = {
  root: string;
  signal: { stopping: boolean };
  done: Promise<void>;
};

export class AppController {
  readonly events = new AppEvents();
  private readonly registry: AppRegistry;
  private readonly hosts = new Map<string, RunningHost>();
  private readonly hostErrors = new Map<string, string>();

  constructor(private readonly appRoot: string) {
    this.registry = new AppRegistry(appRoot);
  }

  close() {
    for (const host of this.hosts.values()) host.signal.stopping = true;
    this.registry.close();
  }

  bootstrap() {
    return {
      cwd: this.appRoot,
      sessions: this.sessions(),
    };
  }

  sessions() {
    return this.registry.list().map((session) => ({
      ...session,
      running: this.hosts.has(session.id),
      error: this.hostErrors.get(session.id) ?? null,
    }));
  }

  pickWorkspace() {
    return pickWorkspaceDirectory();
  }

  createSession(workspace: string) {
    const root = resolve(workspace);
    loadSettings(this.appRoot, { cwd: root });
    const id = `web-${randomUUID()}`;
    this.startHost(id, root, "new");
    this.hostErrors.delete(id);
    const now = Math.floor(Date.now() / 1000);
    return {
      id,
      workspace: root,
      createdAt: now,
      updatedAt: now,
      running: true,
    };
  }

  sendMessage(sessionId: string, content: string) {
    const session = this.registry.require(sessionId);
    this.ensureHost(session.id, session.workspace);
    const result = runClient({ sessionId, append: content }, this.appRoot);
    this.events.notify(sessionId);
    this.hostErrors.delete(sessionId);
    this.registry.touch(sessionId);
    return result;
  }

  control(sessionId: string, control: Control) {
    this.registry.require(sessionId);
    const result = runClient({ sessionId, control }, this.appRoot);
    this.events.notify(sessionId);
    this.registry.touch(sessionId);
    return result;
  }

  async deleteSession(sessionId: string) {
    this.registry.require(sessionId);
    const running = this.hosts.get(sessionId);
    if (running) {
      running.signal.stopping = true;
      await running.done;
    }
    deleteHostSession(sessionId, this.appRoot);
    this.hostErrors.delete(sessionId);
    return { deleted: sessionId };
  }

  transcript(sessionId: string) {
    this.registry.require(sessionId);
    const settings = loadSettings(this.appRoot);
    const paths = resolveSessionPaths(settings, sessionId);
    if (!existsSync(paths.appDb)) throw new Error(`会话不存在：${sessionId}`);
    const db = new AgentDatabase(paths.appDb);
    try {
      return loadTranscript(db, sessionId);
    } finally {
      db.close();
    }
  }

  private ensureHost(sessionId: string, root: string) {
    if (this.hosts.has(sessionId)) return;
    this.startHost(sessionId, root, "load");
  }

  private startHost(
    sessionId: string,
    root: string,
    kind: "new" | "load" | "overwrite",
  ) {
    const signal = { stopping: false };
    const done = runHostSession({ kind, sessionId }, this.appRoot, {
      cwd: root,
      quiet: true,
      signal,
      wake: (delayMs) => this.events.wait(sessionId, delayMs),
      observer: {
        changed: (changedSessionId) => this.events.notify(changedSessionId),
        token: () => {},
      },
    })
      .catch((error) => {
        this.hostErrors.set(
          sessionId,
          error instanceof Error ? error.message : String(error),
        );
      })
      .finally(() => {
        this.hosts.delete(sessionId);
      });
    this.hosts.set(sessionId, { root, signal, done });
  }
}
