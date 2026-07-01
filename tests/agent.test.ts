import { ChatOpenAICompletions, ChatOpenAIResponses } from "@langchain/openai";
import { afterEach, expect, test } from "bun:test";
import { buildModel } from "../src/agent";
import type { Settings } from "../src/types";

const savedEnv = new Map<string, string | undefined>();

afterEach(() => {
  for (const [key, value] of savedEnv) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  savedEnv.clear();
});

function setEnv(key: string, value: string) {
  if (!savedEnv.has(key)) {
    savedEnv.set(key, process.env[key]);
  }
  process.env[key] = value;
}

function makeSettings(api: Settings["model"]["api"]): Settings {
  return {
    paths: { dataDir: "data" },
    model: {
      provider: "openai-compatible",
      api,
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
      recursionLimit: 1,
    },
    logging: {
      level: "debug",
      streamTokens: false,
    },
    agent: {
      systemPrompt: "test",
    },
    skills: {
      enabled: false,
      directory: "~/.agents/skills",
      usagePrompt: "use skills",
      skillEnabled: {},
    },
  };
}

test("buildModel selects OpenAI Completions API", () => {
  setEnv("TEST_OPENAI_KEY", "test-key");
  expect(buildModel(makeSettings("completions"))).toBeInstanceOf(
    ChatOpenAICompletions,
  );
});

test("buildModel selects OpenAI Responses API", () => {
  setEnv("TEST_OPENAI_KEY", "test-key");
  expect(buildModel(makeSettings("responses"))).toBeInstanceOf(
    ChatOpenAIResponses,
  );
});
