import type { Settings } from "../../src/types";

export function testSettings(dataDir: string): Settings {
  return {
    paths: { dataDir },
    attachments: {
      allowedSuffixes: [".txt", ".md"],
      maxSizeBytes: 1024,
    },
    frontend: {
      draftSaveDelayMs: 1,
      transcriptRefreshIntervalMs: 1,
    },
    model: {
      adapter: "completions",
      model: "test",
      apiKeyEnv: "TEST_KEY",
      baseURL: null,
      temperature: 0,
      maxRetries: 0,
      timeoutMs: 1_000,
    },
    host: {
      pollMs: 1,
      pausePollMs: 1,
      idleLogMs: 1,
      recursionLimit: 50,
    },
    logging: { level: "error", streamTokens: false },
    leases: { hostTtlMs: 30_000 },
    toolOutput: { maxTokens: 8_192 },
    hooks: [],
    agent: { systemPrompt: "test" },
    skills: {
      enabled: false,
      directory: "~/.agents/skills",
      usagePrompt: "use skills",
      skillEnabled: {},
    },
  };
}
