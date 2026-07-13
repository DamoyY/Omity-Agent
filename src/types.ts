export type Control = "running" | "pause" | "cancel" | "pause_cancel";

export type SessionStatus = "tool" | "model" | "idle" | "paused" | "error";

export type QueueStatus =
  "draft" | "pending" | "running" | "paused" | "done" | "canceled";

export type LogLevel = "debug" | "info" | "warn" | "error";

export type ReasoningEffort =
  "none" | "minimal" | "low" | "medium" | "high" | "xhigh";

export type ModelApi = "responses" | "completions";

interface SharedModelSettings {
  model: string;
  temperature?: number;
  reasoning_effort?: ReasoningEffort;
  maxRetries: number;
  timeoutMs: number;
}

export type ModelSettings = SharedModelSettings &
  (
    | {
        adapter: ModelApi;
        apiKeyEnv: string;
        baseURL: string | null;
      }
    | {
        adapter: "codex";
        apiKeyEnv?: never;
        baseURL?: never;
      }
  );

export type HookMode = "silent" | "takeover";

export type HookWhen = "before" | "after";

export type HookTrigger = `${string}:${HookWhen}`;

export interface HookRule {
  id: string;
  target: string;
  when: HookWhen;
  runLimit: number;
  mode: HookMode;
  tool: string;
  args: Record<string, unknown>;
}

export interface Settings {
  paths: {
    dataDir: string;
  };
  attachments: {
    allowedSuffixes: string[];
    maxSizeBytes: number;
  };
  frontend: {
    draftSaveDelayMs: number;
    transcriptRefreshIntervalMs: number;
  };
  model: ModelSettings;
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
  leases: {
    hostTtlMs: number;
    hookTtlMs: number;
  };
  toolOutput: {
    maxTokens: number;
  };
  hooks: HookRule[];
  agent: {
    systemPrompt: string;
  };
  skills: {
    enabled: boolean;
    directory: string;
    usagePrompt: string;
    skillEnabled: Record<string, boolean>;
  };
}

export interface SkillInfo {
  name: string;
  description: string;
  source: string;
}

export interface QueueItem {
  id: number;
  runId: number | null;
  content: string;
  status: QueueStatus;
  userMessageId: number | null;
  root: boolean;
}
