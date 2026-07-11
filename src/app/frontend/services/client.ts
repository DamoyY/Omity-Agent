import type { DisplayQueue, TimelineMessage } from "../../timeline";
import type { Control } from "../../../types";

export type SessionInfo = {
  id: string;
  workspace: string;
  createdAt: number;
  updatedAt: number;
  running: boolean;
};

export async function bootstrap() {
  return request<{ cwd: string; sessions: SessionInfo[] }>("/api/bootstrap");
}

export async function createSession(workspace: string) {
  return request<{ session: SessionInfo }>("/api/sessions", {
    method: "POST",
    body: JSON.stringify({ workspace }),
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

export async function loadTranscript(sessionId: string) {
  return request<{
    control: Control;
    queue: DisplayQueue[];
    view: TimelineMessage[];
  }>(`/api/sessions/${encodeURIComponent(sessionId)}/transcript`);
}

export function sessionEvents(sessionId: string) {
  return new EventSource(
    `/api/sessions/${encodeURIComponent(sessionId)}/events`,
  );
}

export async function sendMessage(sessionId: string, content: string) {
  return request(`/api/sessions/${encodeURIComponent(sessionId)}/messages`, {
    method: "POST",
    body: JSON.stringify({ content }),
  });
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
  const response = await fetch(path, {
    headers: { "content-type": "application/json" },
    ...init,
  });
  const json = (await response.json()) as unknown;
  if (!response.ok) {
    const message =
      isRecord(json) && typeof json["error"] === "string"
        ? json["error"]
        : response.statusText;
    throw new Error(message);
  }
  return json as T;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
