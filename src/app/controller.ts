import { AppRegistry, type RegisteredSession } from "./registry";
import type { Control, Settings } from "../types";
import type { MessageSubmission, SessionSubmission } from "./attachments/contract";
import { type SessionInfo, projectSession } from "./sessionState";
import { clearSessionDraft, readSessionDraft, writeSessionDraft } from "./composerDraft";
import { createAppFork, createAppSession } from "./runtime/sessionActions";
import { hasLiveHostLease, recoverAppSessions } from "./runtime/recovery";
import { AppEvents } from "./events";
import { AppHosts } from "./hosts";
import type { AppInstanceOwner } from "./runtime/instanceLock";
import type { ProcessOwner } from "../infrastructure/process/ownership";
import { appOwner } from "../infrastructure/process/ownership";
import { cancelSessionTool } from "./sessionCommands";
import { controllerHostEvents } from "./controllerHostEvents";
import { deleteHostSession } from "../sessionStorage";
import { enqueueMessageWithAttachments } from "./attachments/message";
import { loadSessionTranscript } from "./transcript";
import { loadSettings } from "../infrastructure/configuration/loadSettings";
import { pickWorkspaceDirectory } from "./workspacePicker";
import { runClient } from "../client";
export class AppController {
  readonly events: AppEvents;
  private readonly settings: Settings;
  private readonly registry: AppRegistry;
  private readonly hosts: AppHosts;
  constructor(
    private readonly appRoot: string,
    options: {
      abandonedOwner?: AppInstanceOwner;
      owner?: ProcessOwner;
    } = {},
  ) {
    this.settings = loadSettings(appRoot);
    const discovered = new AppRegistry(this.settings);
    recoverAppSessions(this.settings, discovered.list(), options.abandonedOwner);
    this.registry = new AppRegistry(this.settings);
    this.events = new AppEvents();
    const owner = options.owner ?? appOwner();
    this.hosts = new AppHosts(
      appRoot,
      controllerHostEvents(
        this.events,
        (id) => this.sessionInfo(this.registry.require(id)),
        (id) => {
          this.publishChange(id);
        },
      ),
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
    const result = runClient({ control, sessionId }, this.appRoot);
    this.publishChange(sessionId);
    return result;
  }
  cancelTool(sessionId: string, toolCallId: string) {
    this.registry.require(sessionId);
    const result = cancelSessionTool(this.hosts, this.appRoot, sessionId, toolCallId);
    this.publishChange(sessionId);
    return result;
  }
  async forkSession(sessionId: string, beforeMessageId: number) {
    const session = this.registry.require(sessionId);
    const id = await createAppFork({
      beforeMessageId,
      pauseSource: () => this.control(sessionId, "pause"),
      settings: this.settings,
      sourceSessionId: sessionId,
      workspace: session.workspace,
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
  private ensureHost(session: RegisteredSession) {
    if (!this.hosts.has(session.id) && hasLiveHostLease(this.settings, session.id)) {
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
  private sessionInfo(session: RegisteredSession): SessionInfo {
    return projectSession(session, this.hosts.activity(session.id), this.hosts.error(session.id));
  }
}
