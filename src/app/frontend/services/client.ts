import { type PendingAttachment, appendAttachments } from "../../attachments/contract";
import {
  bootstrapResponseSchema,
  cancellationResponseSchema,
  controlResponseSchema,
  deletedResponseSchema,
  draftResponseSchema,
  messageResponseSchema,
  revisionResponseSchema,
  sessionResponseSchema,
  transcriptResponseSchema,
  workspaceResponseSchema,
} from "./responseSchemas";
import type { Control } from "../../../types";
import type { InitialSessionState } from "../../initialState";
import { reportError } from "./errors";
import { request } from "./request";

export { ApiError } from "./request";
export type { SessionInfo } from "../../sessionState";
export interface FrontendSettings {
  draftSaveDelayMs: number;
  transcriptRefreshIntervalMs: number;
}
export async function bootstrap(signal?: AbortSignal) {
  return request("/api/bootstrap", bootstrapResponseSchema, { signal });
}
export async function createSession(
  workspace: string,
  initialState: InitialSessionState,
  attachments: PendingAttachment[],
) {
  const body = new FormData();
  body.set("workspace", workspace);
  body.set("history", JSON.stringify(initialState.history));
  body.set("message", initialState.message);
  appendAttachments(body, attachments);
  return request("/api/sessions", sessionResponseSchema, {
    body,
    method: "POST",
  });
}
export async function deleteSession(sessionId: string) {
  return request(`/api/sessions/${encodeURIComponent(sessionId)}`, deletedResponseSchema, {
    method: "DELETE",
  });
}
export async function pickWorkspace() {
  return request("/api/workspace-picker", workspaceResponseSchema, {
    method: "POST",
  });
}
export async function loadTranscript(sessionId: string, signal?: AbortSignal) {
  return request(
    `/api/sessions/${encodeURIComponent(sessionId)}/transcript`,
    transcriptResponseSchema,
    { signal },
  );
}
export function sessionEvents(sessionId: string) {
  return eventSource(`/api/sessions/${encodeURIComponent(sessionId)}/events`);
}
export function appEvents() {
  return eventSource("/api/events");
}
export async function loadComposerDraft(sessionId: string) {
  return request(
    `/api/sessions/${encodeURIComponent(sessionId)}/composer-draft`,
    draftResponseSchema,
  );
}
export async function saveComposerDraft(sessionId: string, content: string, revision: number) {
  return request(
    `/api/sessions/${encodeURIComponent(sessionId)}/composer-draft`,
    revisionResponseSchema,
    {
      body: JSON.stringify({ content, revision }),
      method: "PUT",
    },
  );
}
export function beaconComposerDraft(sessionId: string, content: string, revision: number) {
  const body = new Blob([JSON.stringify({ content, revision })], {
    type: "application/json",
  });
  return navigator.sendBeacon(
    `/api/sessions/${encodeURIComponent(sessionId)}/composer-draft`,
    body,
  );
}
export async function sendMessage(
  sessionId: string,
  content: string,
  draftRevision: number,
  attachments: PendingAttachment[],
) {
  const body = new FormData();
  body.set("content", content);
  body.set("draftRevision", draftRevision.toString());
  appendAttachments(body, attachments);
  return request(`/api/sessions/${encodeURIComponent(sessionId)}/messages`, messageResponseSchema, {
    body,
    method: "POST",
  });
}
export async function setControl(
  sessionId: string,
  control: Extract<Control, "running" | "pause" | "cancel">,
) {
  return request(`/api/sessions/${encodeURIComponent(sessionId)}/control`, controlResponseSchema, {
    body: JSON.stringify({ control }),
    method: "POST",
  });
}
export async function cancelTool(sessionId: string, toolCallId: string) {
  return request(
    `/api/sessions/${encodeURIComponent(sessionId)}/tools/cancel`,
    cancellationResponseSchema,
    {
      body: JSON.stringify({ toolCallId }),
      method: "POST",
    },
  );
}
export async function forkSession(sessionId: string, beforeMessageId: number) {
  return request(`/api/sessions/${encodeURIComponent(sessionId)}/fork`, sessionResponseSchema, {
    body: JSON.stringify({ beforeMessageId }),
    method: "POST",
  });
}
function eventSource(path: string) {
  const events = new EventSource(path);
  events.addEventListener("error", (error) => {
    events.close();
    reportError(error, { path });
  });
  return events;
}
