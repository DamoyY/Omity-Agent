import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { runClient } from "../client";
import { sessionNotFound } from "../errors";
import { deleteHostSession } from "../host";
import {
  loadSettings,
  resolveSessionPaths,
  sessionPaths,
} from "../infrastructure/config";
import { AgentDatabase } from "../infrastructure/database";
import { removeDatabaseDirectory } from "../infrastructure/sqlite";
import { normalizeWorkspacePath } from "../infrastructure/workspacePath";
import type { Control, Settings } from "../types";
import { AppEvents } from "./events";
import { forkDatabaseBeforeMessage } from "./fork";
import { AppHosts } from "./hosts";
import { AppRegistry } from "./registry";
import { loadTranscript } from "./transcript";
import { pickWorkspaceDirectory } from "./workspacePicker";

export class AppController {
  readonly events = new AppEvents();
  private readonly settings: Settings;
  private readonly registry: AppRegistry;
  private readonly hosts: AppHosts;

  constructor(private readonly appRoot: string) {
    this.settings = loadSettings(appRoot);
    this.registry = new AppRegistry(this.settings);
    this.hosts = new AppHosts(appRoot, this.events);
  }

  close() {
    return this.hosts.close();
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
      error: this.hosts.error(session.id),
    }));
  }

  assertSession(sessionId: string) {
    this.registry.require(sessionId);
  }

  pickWorkspace() {
    return pickWorkspaceDirectory();
  }

  createSession(workspace: string) {
    const root = normalizeWorkspacePath(workspace, this.appRoot);
    loadSettings(this.appRoot, { cwd: root });
    const id = `web-${randomUUID()}`;
    this.hosts.start(id, root, "new");
    this.hosts.clearError(id);
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
    this.hosts.ensure(session.id, session.workspace);
    const result = runClient({ sessionId, append: content }, this.appRoot);
    this.events.notify(sessionId);
    this.hosts.clearError(sessionId);
    return result;
  }

  control(sessionId: string, control: Control) {
    const session = this.registry.require(sessionId);
    const result = runClient({ sessionId, control }, this.appRoot);
    if (control === "running") this.hosts.ensure(session.id, session.workspace);
    this.events.notify(sessionId);
    return result;
  }

  forkSession(sessionId: string, beforeMessageId: number) {
    const session = this.registry.require(sessionId);
    const id = `web-${randomUUID()}`;
    const sourcePaths = resolveSessionPaths(this.settings, sessionId);
    const targetPaths = sessionPaths(this.settings, id);
    let created = false;
    let source: AgentDatabase | undefined;
    let target: AgentDatabase | undefined;
    try {
      source = new AgentDatabase(sourcePaths.dbPath);
      target = new AgentDatabase(targetPaths.dbPath);
      forkDatabaseBeforeMessage({
        source,
        target,
        sourceSessionId: sessionId,
        targetSessionId: id,
        workspace: session.workspace,
        beforeMessageId,
      });
      this.control(sessionId, "pause");
      created = true;
    } finally {
      try {
        try {
          target?.close();
        } finally {
          source?.close();
        }
      } finally {
        if (!created) {
          removeDatabaseDirectory(targetPaths.dir);
        }
      }
    }
    this.hosts.clearError(id);
    this.events.notify(sessionId);
    return this.registry.require(id);
  }

  async deleteSession(sessionId: string) {
    this.registry.require(sessionId);
    await this.hosts.stop(sessionId);
    deleteHostSession(sessionId, this.appRoot);
    this.hosts.clearError(sessionId);
    return { deleted: sessionId };
  }

  transcript(sessionId: string) {
    this.registry.require(sessionId);
    const paths = resolveSessionPaths(this.settings, sessionId);
    if (!existsSync(paths.dbPath)) throw sessionNotFound(sessionId);
    const db = new AgentDatabase(paths.dbPath);
    try {
      return loadTranscript(db, sessionId);
    } finally {
      db.close();
    }
  }
}
