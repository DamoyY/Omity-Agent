import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { runClient } from "../client";
import { runHostSession } from "../host";
import { loadSettings, resolveSessionPaths } from "../infrastructure/config";
import { AgentDatabase } from "../infrastructure/database";
import type { Control } from "../types";
import { AppRegistry } from "./registry";
import { loadTranscript } from "./transcript";

type RunningHost = {
  root: string;
  signal: { stopping: boolean };
};

export class AppController {
  private readonly registry: AppRegistry;
  private readonly hosts = new Map<string, RunningHost>();

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
    }));
  }

  createSession(workspace: string) {
    const root = resolve(workspace);
    loadSettings(root);
    const id = `web-${randomUUID()}`;
    const session = this.registry.add(id, root);
    this.startHost(id, root, "new");
    return { ...session, running: true };
  }

  sendMessage(sessionId: string, content: string) {
    const session = this.registry.require(sessionId);
    this.ensureHost(session.id, session.workspace);
    const result = runClient({ sessionId, append: content }, session.workspace);
    this.registry.touch(sessionId);
    return result;
  }

  control(sessionId: string, control: Control) {
    const session = this.registry.require(sessionId);
    const result = runClient({ sessionId, control }, session.workspace);
    this.registry.touch(sessionId);
    return result;
  }

  transcript(sessionId: string) {
    const session = this.registry.require(sessionId);
    const settings = loadSettings(session.workspace);
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
    this.hosts.set(sessionId, { root, signal });
    void runHostSession({ kind, sessionId }, root, {
      signal,
      observer: {
        token: () => {},
      },
    })
      .catch((error) => {
        console.error(error instanceof Error ? error.message : String(error));
      })
      .finally(() => {
        this.hosts.delete(sessionId);
      });
  }
}
