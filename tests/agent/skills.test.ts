import { afterEach, expect, test } from "bun:test";
import { buildSkillsMessage, loadSkills } from "../../src/skills";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { HumanMessage } from "@langchain/core/messages";
import type { Settings } from "../../src/types";
import { createTestDirectory } from "../support/artifacts";
import { join } from "node:path";
import { modelMessages } from "../../src/agent";

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { force: true, recursive: true });
  }
});
test("loads enabled skills from SKILL.md front matter", () => {
  const skillsDir = makeSkillsDir();
  writeSkill(skillsDir, "code", "code", "代码任务");
  writeSkill(skillsDir, "web", "web", "联网查询");
  const settings = makeSettings(skillsDir, { web: false });
  expect(loadSkills(settings)).toEqual([
    {
      description: "代码任务",
      name: "code",
      source: join(skillsDir, "code", "SKILL.md"),
    },
  ]);
  expect(buildSkillsMessage(settings)).toContain("- code: 代码任务");
  expect(buildSkillsMessage(settings)).not.toContain("- web: 联网查询");
});
test("puts skills message after the configured system prompt", () => {
  const skillsMessage = "Skills usage\n\n## Skills 列表\n- code: 代码任务";
  const settings = makeSettings("unused", {});
  settings.agent.systemPrompt = "system prompt";
  expect(
    modelMessages(settings, skillsMessage, [new HumanMessage("hello")]).map(
      (message) => message.text,
    ),
  ).toEqual(["system prompt", skillsMessage, "hello"]);
});
function makeSkillsDir() {
  const dir = createTestDirectory("skills");
  dirs.push(dir);
  return dir;
}
function writeSkill(skillsDir: string, dirname: string, name: string, description: string) {
  const dir = join(skillsDir, dirname);
  mkdirSync(dir);
  writeFileSync(
    join(dir, "SKILL.md"),
    `---\nname: "${name}"\ndescription: "${description}"\n---\n\nbody\n`,
  );
}
function makeSettings(skillsDir: string, skillEnabled: Record<string, boolean>): Settings {
  return {
    access: {
      challengeTtlMs: 300_000,
      loginRateLimit: { attempts: 10, windowMs: 60_000 },
      publicOrigin: "https://omity.example.test",
      sessionTtlMs: 43_200_000,
      trustedProxies: ["127.0.0.1/32"],
    },
    agent: {
      systemPrompt: "test",
    },
    attachments: { allowedSuffixes: [".txt"], maxSizeBytes: 1024 },
    frontend: {
      draftSaveDelayMs: 1,
      transcriptRefreshIntervalMs: 1,
    },
    hooks: [],
    host: {
      idleLogMs: 1,
      pausePollMs: 1,
      pollMs: 1,
      recursionLimit: 10,
      shutdownTimeoutMs: 1000,
    },
    leases: { hostTtlMs: 30_000 },
    logging: {
      level: "error",
      streamTokens: false,
    },
    model: {
      adapter: "completions",
      apiKeyEnv: "TEST_OPENAI_KEY",
      baseURL: null,
      model: "test-model",
      temperature: 0,
      timeoutMs: 1000,
    },
    paths: { dataDir: "data" },
    skills: {
      directory: skillsDir,
      enabled: true,
      skillEnabled,
      usagePrompt: "use skills",
    },
    toolOutput: {
      maxTokens: 8192,
    },
  };
}
