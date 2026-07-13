import type { Control } from "../../../types";
import { z } from "zod";
import { reportError } from "./errors";
import type { InitialSessionState } from "../../initialState";
import type { SessionInfo } from "../../sessionState";
import type { TranscriptSnapshot } from "./transcript/cache";
import type {
  AttachmentSettings,
  PendingAttachment,
} from "../../attachments/contract";
import { appendAttachments } from "../../attachments/contract";

const errorResponse = z.object({
  error: z.object({ code: z.string(), message: z.string() }),
});

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

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
  return request<{ deleted: string }>(
    `/api/sessions/${encodeURIComponent(sessionId)}`,
    {
      method: "DELETE",
    },
  );
}

export async function pickWorkspace() {
  return request<{ workspace: string | null }>("/api/workspace-picker", {
    method: "POST",
  });
}

export async function loadTranscript(sessionId: string, signal?: AbortSignal) {
  return request<TranscriptSnapshot>(
    `/api/sessions/${encodeURIComponent(sessionId)}/transcript`,
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
  return request<{ content: string | null; revision: number }>(
    `/api/sessions/${encodeURIComponent(sessionId)}/composer-draft`,
  );
}

export async function saveComposerDraft(
  sessionId: string,
  content: string,
  revision: number,
) {
  return request<{ revision: number }>(
    `/api/sessions/${encodeURIComponent(sessionId)}/composer-draft`,
    {
      method: "PUT",
      body: JSON.stringify({ content, revision }),
    },
  );
}

export function beaconComposerDraft(
  sessionId: string,
  content: string,
  revision: number,
) {
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

export async function forkSession(sessionId: string, beforeMessageId: number) {
  return request<{ session: SessionInfo }>(
    `/api/sessions/${encodeURIComponent(sessionId)}/fork`,
    {
      method: "POST",
      body: JSON.stringify({ beforeMessageId }),
    },
  );
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  try {
    const response = await fetch(path, {
      headers:
        init?.body instanceof FormData
          ? undefined
          : { "content-type": "application/json" },
      ...init,
    });
    const json = (await response.json()) as unknown;
    if (!response.ok) {
      const parsed = errorResponse.safeParse(json);
      if (!parsed.success) {
        throw new Error(
          `API 错误响应结构无效：HTTP ${response.status.toString()}`,
        );
      }
      throw new ApiError(
        response.status,
        parsed.data.error.code,
        parsed.data.error.message,
      );
    }
    return json as T;
  } catch (error) {
    if (!init?.signal?.aborted) reportError(error, { path });
    throw error;
  }
}

function eventSource(path: string) {
  const events = new EventSource(path);
  events.addEventListener("error", (error) => {
    reportError(error, { path });
  });
  return events;
}
