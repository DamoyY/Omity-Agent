import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { HumanMessage } from "@langchain/core/messages";
import { afterEach, expect, test } from "bun:test";
import { modelMessages } from "../../src/agent";
import { buildSkillsMessage, loadSkills } from "../../src/skills";
import type { Settings } from "../../src/types";

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("loads enabled skills from SKILL.md front matter", () => {
  const skillsDir = makeSkillsDir();
  writeSkill(skillsDir, "code", "code", "代码任务");
  writeSkill(skillsDir, "web", "web", "联网查询");

  const settings = makeSettings(skillsDir, { web: false });

  expect(loadSkills(settings)).toEqual([
    {
      name: "code",
      description: "代码任务",
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
  const dir = mkdtempSync(join(tmpdir(), "agent-skills-"));
  dirs.push(dir);
  return dir;
}

function writeSkill(
  skillsDir: string,
  dirname: string,
  name: string,
  description: string,
) {
  const dir = join(skillsDir, dirname);
  mkdirSync(dir);
  writeFileSync(
    join(dir, "SKILL.md"),
    `---\nname: "${name}"\ndescription: "${description}"\n---\n\nbody\n`,
  );
}

function makeSettings(
  skillsDir: string,
  skillEnabled: Record<string, boolean>,
): Settings {
  return {
    paths: { dataDir: "data" },
    attachments: { allowedSuffixes: [".txt"], maxSizeBytes: 1024 },
    frontend: {
      draftSaveDelayMs: 1,
      transcriptRefreshIntervalMs: 1,
    },
    model: {
      adapter: "completions",
      model: "test-model",
      apiKeyEnv: "TEST_OPENAI_KEY",
      baseURL: null,
      temperature: 0,
      maxRetries: 0,
      timeoutMs: 1000,
    },
    host: {
      pollMs: 1,
      pausePollMs: 1,
      idleLogMs: 1,
      recursionLimit: 10,
    },
    logging: {
      level: "error",
      streamTokens: false,
    },
    leases: { hostTtlMs: 30_000, hookTtlMs: 30_000 },
    toolOutput: {
      maxTokens: 8192,
    },
    hooks: [],
    agent: {
      systemPrompt: "test",
    },
    skills: {
      enabled: true,
      directory: skillsDir,
      usagePrompt: "use skills",
      skillEnabled,
    },
  };
}
