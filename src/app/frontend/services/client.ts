import type { Control } from "../../../types";
import { reportError } from "./errors";
import { request } from "./request";
import type { InitialSessionState } from "../../initialState";
import type { SessionInfo } from "../../sessionState";
import type { TranscriptSnapshot } from "./transcript/cache";
import type { AttachmentSettings, PendingAttachment } from "../../attachments/contract";
import { appendAttachments } from "../../attachments/contract";
export { ApiError } from "./request";
export type { SessionInfo } from "../../sessionState";
export interface FrontendSettings {
  draftSaveDelayMs: number;
  transcriptRefreshIntervalMs: number;
}
export async function bootstrap(signal?: AbortSignal) {
  return request<{
    attachments: AttachmentSettings;
    cwd: string;
    frontend: FrontendSettings;
    sessions: SessionInfo[];
  }>("/api/bootstrap", { signal });
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
  return request<{ session: SessionInfo }>("/api/sessions", {
    method: "POST",
    body,
  });
}
export async function deleteSession(sessionId: string) {
  return request<{ deleted: string }>(`/api/sessions/${encodeURIComponent(sessionId)}`, {
    method: "DELETE",
  });
}
export async function pickWorkspace() {
  return request<{ workspace: string | null }>("/api/workspace-picker", {
    method: "POST",
  });
}
export async function loadTranscript(sessionId: string, signal?: AbortSignal) {
  return request<TranscriptSnapshot>(`/api/sessions/${encodeURIComponent(sessionId)}/transcript`, {
    signal,
  });
}
export function sessionEvents(sessionId: string) {
  return eventSource(`/api/sessions/${encodeURIComponent(sessionId)}/events`);
}
export function appEvents() {
  return eventSource("/api/events");
}
export async function loadComposerDraft(sessionId: string) {
  return request<{ content: string | null; revision: number }>(
    `/api/sessions/${encodeURIComponent(sessionId)}/composer-draft`,
  );
}
export async function saveComposerDraft(sessionId: string, content: string, revision: number) {
  return request<{ revision: number }>(
    `/api/sessions/${encodeURIComponent(sessionId)}/composer-draft`,
    {
      method: "PUT",
      body: JSON.stringify({ content, revision }),
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
  return request<{ content: string; queueId: number }>(
    `/api/sessions/${encodeURIComponent(sessionId)}/messages`,
    {
      method: "POST",
      body,
    },
  );
}
export async function setControl(
  sessionId: string,
  control: Extract<Control, "running" | "pause" | "cancel">,
) {
  return request(`/api/sessions/${encodeURIComponent(sessionId)}/control`, {
    method: "POST",
    body: JSON.stringify({ control }),
  });
}
export async function cancelTool(sessionId: string, toolCallId: string) {
  return request<{ toolCallId: string }>(
    `/api/sessions/${encodeURIComponent(sessionId)}/tools/cancel`,
    {
      method: "POST",
      body: JSON.stringify({ toolCallId }),
    },
  );
}
export async function forkSession(sessionId: string, beforeMessageId: number) {
  return request<{ session: SessionInfo }>(`/api/sessions/${encodeURIComponent(sessionId)}/fork`, {
    method: "POST",
    body: JSON.stringify({ beforeMessageId }),
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
