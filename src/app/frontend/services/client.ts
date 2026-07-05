export type SessionInfo = {
  id: string;
  workspace: string;
  createdAt: number;
  updatedAt: number;
  running: boolean;
};

export type Message = {
  id: number;
  role: "user" | "assistant" | "tool";
  content: string;
  queueId: number | null;
  toolCalls: ToolCall[];
  toolCallId?: string;
  createdAt: number;
};

export type ToolCall = {
  id: string;
  inputText?: string;
  name: string;
  input: unknown;
  streaming?: boolean;
};

export type QueueItem = {
  id: number;
  content: string;
  status: string;
  error: string | null;
};

export type StreamEvent = {
  id: number;
  message: string;
  payload: unknown;
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
    messages: Message[];
    queue: QueueItem[];
    events: StreamEvent[];
  }>(`/api/sessions/${encodeURIComponent(sessionId)}/transcript`);
}

export async function sendMessage(sessionId: string, content: string) {
  return request(`/api/sessions/${encodeURIComponent(sessionId)}/messages`, {
    method: "POST",
    body: JSON.stringify({ content }),
  });
}

export async function setControl(sessionId: string, control: string) {
  return request(`/api/sessions/${encodeURIComponent(sessionId)}/control`, {
    method: "POST",
    body: JSON.stringify({ control }),
  });
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
