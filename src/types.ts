export type Control = "running" | "pause" | "cancel";

export type QueueStatus =
  "pending" | "running" | "paused" | "done" | "canceled" | "failed";

export type LogLevel = "debug" | "info" | "warn" | "error";

export type Settings = {
  paths: {
    dataDir: string;
  };
  model: {
    provider: "openai-compatible";
    api: "responses" | "completions";
    model: string;
    apiKeyEnv: string;
    baseURL: string | null;
    temperature: number;
    maxRetries: number;
    timeoutMs: number;
  };
  host: {
    pollMs: number;
    pausePollMs: number;
    idleLogMs: number;
    recursionLimit: number;
  };
  logging: {
    level: LogLevel;
    streamTokens: boolean;
  };
  agent: {
    systemPrompt: string;
  };
};

export type QueueItem = {
  id: number;
  content: string;
  status: QueueStatus;
  userMessageId: number | null;
};

export type TranscriptMessage = {
  role: "user" | "assistant";
  content: string;
};
