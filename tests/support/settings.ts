import type { Settings } from "../../src/types";

export function testSettings(dataDir: string): Settings {
  return {
    agent: { systemPrompt: "test" },
    attachments: {
      allowedSuffixes: [".txt", ".md"],
      maxSizeBytes: 1024,
    },
    frontend: {
      draftSaveDelayMs: 1,
      transcriptRefreshIntervalMs: 1,
    },
    hooks: [],
    host: {
      idleLogMs: 1,
      pausePollMs: 1,
      pollMs: 1,
      recursionLimit: 50,
      shutdownTimeoutMs: 1000,
    },
    leases: { hostTtlMs: 30_000 },
    logging: { level: "error", streamTokens: false },
    model: {
      adapter: "completions",
      apiKeyEnv: "TEST_KEY",
      baseURL: null,
      model: "test",
      temperature: 0,
      timeoutMs: 1000,
    },
    paths: { dataDir },
    skills: {
      directory: "~/.agents/skills",
      enabled: false,
      skillEnabled: {},
      usagePrompt: "use skills",
    },
    toolOutput: { maxTokens: 8192 },
  };
}
