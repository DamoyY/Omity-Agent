import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AIMessage } from "@langchain/core/messages";
import { fakeModel } from "@langchain/core/testing";
import { createAgent } from "langchain";
import { afterEach, expect, test } from "bun:test";
import { createSkillsMiddleware } from "../src/agent";
import { buildSkillsMessage, loadSkills } from "../src/skills";
import type { Settings } from "../src/types";

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

test("puts skills message after the configured system prompt", async () => {
  const skillsMessage = "Skills usage\n\n## Skills 列表\n- code: 代码任务";
  const model = fakeModel().respond((messages) => {
    expect(messages.map((message) => message.text)).toEqual([
      "system prompt",
      skillsMessage,
      "hello",
    ]);
    return new AIMessage("done");
  });
  const agent = createAgent({
    model,
    tools: [],
    systemPrompt: "system prompt",
    middleware: [createSkillsMiddleware(skillsMessage)],
  });

  await agent.invoke({ messages: [{ role: "user", content: "hello" }] });

  expect(model.callCount).toBe(1);
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
    model: {
      provider: "openai-compatible",
      api: "completions",
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
