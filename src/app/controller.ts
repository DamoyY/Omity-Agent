import { runClient } from "../client";
import type { StreamEvent } from "../infrastructure/database/records/streamEvents";
import { deleteHostSession } from "../host";
import { loadSettings } from "../infrastructure/configuration/loadSettings";
import { appOwner } from "../infrastructure/process/ownership";
import type { ProcessOwner } from "../infrastructure/process/ownership";
import type { Control, Settings } from "../types";
import type { MessageSubmission } from "./attachments/contract";
import type { SessionSubmission } from "./attachments/contract";
import { enqueueMessageWithAttachments } from "./attachments/message";
import { clearSessionDraft } from "./composerDraft";
import { readSessionDraft } from "./composerDraft";
import { writeSessionDraft } from "./composerDraft";
import { AppEvents } from "./events";
import { AppHosts } from "./hosts";
import { AppRegistry, type RegisteredSession } from "./registry";
import { projectSession, type SessionInfo } from "./sessionState";
import { loadSessionTranscript } from "./transcript";
import { pickWorkspaceDirectory } from "./workspacePicker";
import { displayStreamEvent } from "./timeline";
import type { AppInstanceOwner } from "./runtime/instanceLock";
import { hasLiveHostLease, recoverAppSessions } from "./runtime/recovery";
import { createAppFork, createAppSession } from "./runtime/sessionActions";

interface AppControllerOptions {
  abandonedOwner?: AppInstanceOwner;
  owner?: ProcessOwner;
}

export class AppController {
  readonly events: AppEvents;
  private readonly settings: Settings;
  private readonly registry: AppRegistry;
  private readonly hosts: AppHosts;

  constructor(
    private readonly appRoot: string,
    options: AppControllerOptions = {},
  ) {
    this.settings = loadSettings(appRoot);
    const discovered = new AppRegistry(this.settings);
    recoverAppSessions(
      this.settings,
      discovered.list(),
      options.abandonedOwner,
    );
    this.registry = new AppRegistry(this.settings);
    this.events = new AppEvents();
    const owner = options.owner ?? appOwner();
    this.hosts = new AppHosts(
      appRoot,
      {
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
      },
      owner,
      this.settings.host.shutdownTimeoutMs,
    );
  }

  close = () => this.hosts.close();

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

  pickWorkspace = () => pickWorkspaceDirectory();

  async createSession(submission: SessionSubmission) {
    const created = await createAppSession(this.appRoot, submission);
    const session = this.registry.refresh(created.sessionId);
    await this.hosts.start(created.sessionId, created.workspace, "load");
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
      () => this.ensureHost(session),
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

  async control(sessionId: string, control: Control) {
    const session = this.registry.require(sessionId);
    if (control === "running") {
      await this.ensureHost(session);
    }
    const result = runClient({ sessionId, control }, this.appRoot);
    this.publishChange(sessionId);
    return result;
  }

  async forkSession(sessionId: string, beforeMessageId: number) {
    const session = this.registry.require(sessionId);
    const id = await createAppFork({
      settings: this.settings,
      sourceSessionId: sessionId,
      workspace: session.workspace,
      beforeMessageId,
      pauseSource: () => this.control(sessionId, "pause"),
    });
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

  private ensureHost(session: RegisteredSession) {
    if (
      !this.hosts.has(session.id) &&
      hasLiveHostLease(this.settings, session.id)
    ) {
      return Promise.resolve();
    }
    return this.hosts.ensure(session.id, session.workspace);
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
