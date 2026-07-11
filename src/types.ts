export type Control = "running" | "pause" | "cancel" | "pause_cancel";

export type QueueStatus =
  "draft" | "pending" | "running" | "paused" | "done" | "canceled";

export type LogLevel = "debug" | "info" | "warn" | "error";

export type ReasoningEffort =
  "none" | "minimal" | "low" | "medium" | "high" | "xhigh";

export type HookMode = "silent" | "takeover";

export type HookWhen = "before" | "after";

export type HookTrigger = `${string}:${HookWhen}`;

export type HookRule = {
  id: string;
  target: string;
  when: HookWhen;
  runLimit: number;
  mode: HookMode;
  tool: string;
  args: Record<string, unknown>;
};

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
    temperature?: number;
    reasoning_effort?: ReasoningEffort;
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
};

export type SkillInfo = {
  name: string;
  description: string;
  source: string;
};

export type QueueItem = {
  id: number;
  runId: number | null;
  content: string;
  status: QueueStatus;
  userMessageId: number | null;
  root: boolean;
};
