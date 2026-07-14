import { ChatOpenAICompletions, ChatOpenAIResponses } from "@langchain/openai";
import type { ModelApi, Settings } from "../../src/types";
import { afterEach, expect, test } from "bun:test";
import {
  buildModel,
  normalizeResponsesPayload,
  normalizeResponsesStreamEvent,
} from "../../src/agent";
const savedEnv = new Map<string, string | undefined>();
afterEach(() => {
  for (const [key, value] of savedEnv) {
    if (value === undefined) {
      Reflect.deleteProperty(process.env, key);
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
function makeSettings(api: ModelApi): Settings {
  return {
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
      recursionLimit: 1,
      shutdownTimeoutMs: 1000,
    },
    leases: { hostTtlMs: 30_000 },
    logging: {
      level: "debug",
      streamTokens: false,
    },
    model: {
      adapter: api,
      apiKeyEnv: "TEST_OPENAI_KEY",
      baseURL: null,
      model: "test-model",
      temperature: 0,
      timeoutMs: 1000,
    },
    paths: { dataDir: "data" },
    skills: {
      directory: "~/.agents/skills",
      enabled: false,
      skillEnabled: {},
      usagePrompt: "use skills",
    },
    toolOutput: {
      maxTokens: 8192,
    },
  };
}
test("buildModel passes reasoning_effort to OpenAI Completions API", () => {
  setEnv("TEST_OPENAI_KEY", "test-key");
  const settings = makeSettings("completions");
  settings.model.model = "gpt-5";
  settings.model.reasoning_effort = "high";
  const model = buildModel(settings, "session-1");
  expect(model).toBeInstanceOf(ChatOpenAICompletions);
  expect((model as ChatOpenAICompletions).invocationParams().reasoning_effort).toBe("high");
});
test("buildModel passes reasoning_effort to OpenAI Responses API", () => {
  setEnv("TEST_OPENAI_KEY", "test-key");
  const settings = makeSettings("responses");
  settings.model.model = "gpt-5";
  settings.model.reasoning_effort = "low";
  const model = buildModel(settings, "session-1");
  expect(model).toBeInstanceOf(ChatOpenAIResponses);
  expect((model as ChatOpenAIResponses).invocationParams().reasoning).toEqual({
    effort: "low",
    summary: "detailed",
  });
});
test("buildModel disables remote storage and enables ZDR for all APIs", () => {
  setEnv("TEST_OPENAI_KEY", "test-key");
  const completions = buildModel(makeSettings("completions"), "session-1");
  const responses = buildModel(makeSettings("responses"), "session-1");
  expect((completions as ChatOpenAICompletions).zdrEnabled).toBeTrue();
  expect((completions as ChatOpenAICompletions).invocationParams().store).toBeFalse();
  expect((responses as ChatOpenAIResponses).zdrEnabled).toBeTrue();
  expect((responses as ChatOpenAIResponses).invocationParams().store).toBeFalse();
});
test("buildModel requests encrypted reasoning from OpenAI Responses API", () => {
  setEnv("TEST_OPENAI_KEY", "test-key");
  const settings = makeSettings("responses");
  settings.model.model = "gpt-5";
  const model = buildModel(settings, "session-1");
  expect((model as ChatOpenAIResponses).invocationParams().include).toEqual([
    "reasoning.encrypted_content",
  ]);
});
test("buildModel passes instructions to OpenAI Responses API", () => {
  setEnv("TEST_OPENAI_KEY", "test-key");
  const model = buildModel(makeSettings("responses"), "session-1", "system\n\nskills");
  expect((model as ChatOpenAIResponses).invocationParams().instructions).toBe("system\n\nskills");
});
test("buildModel uses the session ID as the Responses prompt cache key", () => {
  setEnv("TEST_OPENAI_KEY", "test-key");
  const model = buildModel(makeSettings("responses"), "session-1");
  expect((model as ChatOpenAIResponses).invocationParams().prompt_cache_key).toBe("session-1");
});
test("normalizes missing Responses API output_text annotations", () => {
  const response = {
    output: [
      {
        content: [{ text: "hello", type: "output_text" }],
        type: "message",
      },
    ],
  };
  expect(normalizeResponsesPayload(response as unknown)).toEqual({
    output: [
      {
        content: [{ annotations: [], text: "hello", type: "output_text" }],
        type: "message",
      },
    ],
  });
});
test("normalizes completed Responses API stream events", () => {
  const event = {
    response: {
      output: [
        {
          content: [{ text: "hello", type: "output_text" }],
          type: "message",
        },
      ],
    },
    type: "response.completed",
  };
  const normalized = normalizeResponsesStreamEvent(
    event as Parameters<typeof normalizeResponsesStreamEvent>[0],
  );
  expect(normalized as unknown).toEqual({
    response: {
      output: [
        {
          content: [{ annotations: [], text: "hello", type: "output_text" }],
          type: "message",
        },
      ],
    },
    type: "response.completed",
  });
});
