import { randomUUID } from "node:crypto";
import { runClient } from "../client";
import type { StreamEvent } from "../infrastructure/database/records/streamEvents";
import { deleteHostSession } from "../host";
import { loadSettings } from "../infrastructure/configuration/loadSettings";
import { normalizeWorkspacePath } from "../infrastructure/configuration/workspacePath";
import type { Control, Settings } from "../types";
import type {
  MessageSubmission,
  SessionSubmission,
} from "./attachments/contract";
import { enqueueMessageWithAttachments } from "./attachments/message";
import { createSessionWithAttachments } from "./attachments/session";
import {
  clearSessionDraft,
  readSessionDraft,
  writeSessionDraft,
} from "./composerDraft";
import { AppEvents } from "./events";
import { AppHosts } from "./hosts";
import { AppRegistry, type RegisteredSession } from "./registry";
import { projectSession, type SessionInfo } from "./sessionState";
import { loadSessionTranscript } from "./transcript";
import { pickWorkspaceDirectory } from "./workspacePicker";
import { displayStreamEvent } from "./timeline";
import {
  forkSessionStorage,
  removeSessionStorage,
} from "./runtime/sessionStorage";

export class AppController {
  readonly events: AppEvents;
  private readonly settings: Settings;
  private readonly registry: AppRegistry;
  private readonly hosts: AppHosts;

  constructor(private readonly appRoot: string) {
    this.settings = loadSettings(appRoot);
    this.registry = new AppRegistry(this.settings);
    this.events = new AppEvents();
    this.hosts = new AppHosts(appRoot, {
      activity: (sessionId) => {
        this.publishActivity(sessionId);
      },
      changed: (sessionId) => {
        this.publishChange(sessionId);
      },
      transcript: (sessionId, event) => {
        this.publishTranscript(sessionId, event);
      },
      wait: (sessionId, delayMs) => this.events.wait(sessionId, delayMs),
    });
  }

  close() {
    return this.hosts.close();
  }

  bootstrap() {
    return {
      attachments: this.settings.attachments,
      cwd: this.appRoot,
      frontend: this.settings.frontend,
      sessions: this.sessions(),
    };
  }

  sessions() {
    return this.registry.list().map((session) => this.sessionInfo(session));
  }

  assertSession(sessionId: string) {
    this.registry.require(sessionId);
  }

  pickWorkspace() {
    return pickWorkspaceDirectory();
  }

  async createSession(submission: SessionSubmission) {
    const root = normalizeWorkspacePath(submission.workspace, this.appRoot);
    const settings = loadSettings(this.appRoot, { cwd: root });
    const id = `web-${randomUUID()}`;
    await createSessionWithAttachments({
      settings,
      sessionId: id,
      workspace: root,
      history: submission.history,
      message: submission.message,
      attachments: submission.attachments,
    });
    const session = this.registry.refresh(id);
    this.hosts.start(id, root, "load");
    const info = this.sessionInfo(session);
    this.events.notifySession(info);
    return info;
  }

  async sendMessage(sessionId: string, submission: MessageSubmission) {
    const session = this.registry.require(sessionId);
    const result = await enqueueMessageWithAttachments(
      this.settings,
      this.appRoot,
      sessionId,
      submission.content,
      submission.attachments,
      () => {
        this.hosts.ensure(session.id, session.workspace);
      },
    );
    clearSessionDraft(this.settings, sessionId, submission.draftRevision);
    this.hosts.clearError(sessionId);
    this.publishChange(sessionId);
    return result;
  }

  composerDraft(sessionId: string) {
    this.registry.require(sessionId);
    return readSessionDraft(this.settings, sessionId);
  }

  saveComposerDraft(sessionId: string, content: string, revision: number) {
    this.registry.require(sessionId);
    return writeSessionDraft(this.settings, sessionId, content, revision);
  }

  control(sessionId: string, control: Control) {
    const session = this.registry.require(sessionId);
    const result = runClient({ sessionId, control }, this.appRoot);
    if (control === "running") this.hosts.ensure(session.id, session.workspace);
    this.publishChange(sessionId);
    return result;
  }

  forkSession(sessionId: string, beforeMessageId: number) {
    const session = this.registry.require(sessionId);
    const id = `web-${randomUUID()}`;
    let targetCreated = false;
    try {
      forkSessionStorage({
        settings: this.settings,
        sourceSessionId: sessionId,
        targetSessionId: id,
        workspace: session.workspace,
        beforeMessageId,
      });
      targetCreated = true;
      this.control(sessionId, "pause");
    } catch (error) {
      if (targetCreated) removeSessionStorage(this.settings, id);
      throw error;
    }
    const targetSession = this.registry.refresh(id);
    this.hosts.clearError(id);
    const info = this.sessionInfo(targetSession);
    this.events.notifySession(info);
    return info;
  }

  async deleteSession(sessionId: string) {
    this.registry.require(sessionId);
    await this.hosts.stop(sessionId);
    deleteHostSession(sessionId, this.appRoot);
    this.hosts.clearError(sessionId);
    this.registry.remove(sessionId);
    this.events.notifyDeleted(sessionId);
    return { deleted: sessionId };
  }

  transcript(sessionId: string) {
    this.registry.require(sessionId);
    return loadSessionTranscript(this.settings, sessionId);
  }

  private publishActivity(sessionId: string) {
    const info = this.sessionInfo(this.registry.require(sessionId));
    this.events.notifySession(info);
  }

  private publishChange(sessionId: string) {
    this.events.wake(sessionId);
    const info = this.sessionInfo(this.registry.refresh(sessionId));
    this.events.notifySession(info);
    this.events.invalidateTranscript(sessionId);
  }

  private publishTranscript(sessionId: string, event: StreamEvent) {
    this.events.notifyTranscript(sessionId, displayStreamEvent(event));
  }

  private sessionInfo(session: RegisteredSession): SessionInfo {
    return projectSession(
      session,
      this.hosts.activity(session.id),
      this.hosts.error(session.id),
    );
  }
}
