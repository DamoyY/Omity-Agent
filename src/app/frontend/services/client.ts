import type { DisplayQueue, TimelineMessage } from "../../timeline";
import type { Control } from "../../../types";
import type { SessionStatus } from "../../../types";
import { z } from "zod";
import { reportError } from "./errors";
import type { ErrorDetails } from "../../../failures/details";

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

export interface SessionInfo {
  id: string;
  workspace: string;
  createdAt: number;
  updatedAt: number;
  status: SessionStatus;
  error: ErrorDetails | null;
}

export async function bootstrap(signal?: AbortSignal) {
  return request<{ cwd: string; sessions: SessionInfo[] }>("/api/bootstrap", {
    signal,
  });
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

export async function loadTranscript(sessionId: string, signal?: AbortSignal) {
  return request<{
    control: Control;
    queue: DisplayQueue[];
    view: TimelineMessage[];
  }>(`/api/sessions/${encodeURIComponent(sessionId)}/transcript`, { signal });
}

export function sessionEvents(sessionId: string) {
  return eventSource(`/api/sessions/${encodeURIComponent(sessionId)}/events`);
}

export function appEvents() {
  return eventSource("/api/events");
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
  try {
    const response = await fetch(path, {
      headers: { "content-type": "application/json" },
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
