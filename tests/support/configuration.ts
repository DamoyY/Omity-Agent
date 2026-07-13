import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

interface TestConfigurationOptions {
  dataDir?: string;
  modelYaml?: string;
  systemPrompt?: string;
  skillsPrompt?: string;
}

const defaultModelYaml = `profile: test
profiles:
  test:
    adapter: completions
    model: test
    apiKeyEnv: TEST_KEY
    baseURL: null
    temperature: 0
    reasoning_effort: medium
    maxRetries: 0
    timeoutMs: 1000
`;

export function writeTestConfiguration(
  root: string,
  options: TestConfigurationOptions = {},
) {
  const settingsDir = join(root, "settings");
  const promptsDir = join(settingsDir, "prompts");
  mkdirSync(promptsDir, { recursive: true });
  writeFileSync(
    join(settingsDir, "main.yaml"),
    `paths:
  dataDir: ${options.dataDir ?? "./data"}
attachments:
  allowedSuffixes:
    - .txt
    - .md
  maxSizeBytes: 1024
frontend:
  draftSaveDelayMs: 1
  transcriptRefreshIntervalMs: 1
host:
  pollMs: 1
  pausePollMs: 1
  idleLogMs: 1
  recursionLimit: 1
  shutdownTimeoutMs: 1000
logging:
  level: debug
  streamTokens: false
leases:
  hostTtlMs: 30000
toolOutput:
  maxTokens: 8192
skills:
  enabled: false
  directory: ~/.agents/skills
  skillEnabled: {}
`,
  );
  writeFileSync(
    join(settingsDir, "model.yaml"),
    options.modelYaml ?? defaultModelYaml,
  );
  writeFileSync(join(settingsDir, "hooks.yaml"), "hooks: []\n");
  writeFileSync(join(promptsDir, "system.md"), options.systemPrompt ?? "test");
  writeFileSync(
    join(promptsDir, "skills.md"),
    options.skillsPrompt ?? "use skills",
  );
  return settingsDir;
}
