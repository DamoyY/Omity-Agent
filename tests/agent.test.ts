import { ChatOpenAICompletions, ChatOpenAIResponses } from "@langchain/openai";
import { afterEach, expect, test } from "bun:test";
import {
  buildModel,
  buildResponsesInstructions,
  normalizeResponsesPayload,
  normalizeResponsesStreamEvent,
} from "../src/agent";
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
    toolOutput: {
      maxTokens: 8192,
    },
    hooks: [],
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

test("buildModel passes reasoning_effort to OpenAI Completions API", () => {
  setEnv("TEST_OPENAI_KEY", "test-key");
  const settings = makeSettings("completions");
  settings.model.model = "gpt-5";
  settings.model.reasoning_effort = "high";
  const model = buildModel(settings);

  expect(model).toBeInstanceOf(ChatOpenAICompletions);
  expect(
    (model as ChatOpenAICompletions).invocationParams().reasoning_effort,
  ).toBe("high");
});

test("buildModel passes reasoning_effort to OpenAI Responses API", () => {
  setEnv("TEST_OPENAI_KEY", "test-key");
  const settings = makeSettings("responses");
  settings.model.model = "gpt-5";
  settings.model.reasoning_effort = "low";
  const model = buildModel(settings);

  expect(model).toBeInstanceOf(ChatOpenAIResponses);
  expect((model as ChatOpenAIResponses).invocationParams().reasoning).toEqual({
    effort: "low",
  });
});

test("buildModel requests encrypted reasoning from OpenAI Responses API", () => {
  setEnv("TEST_OPENAI_KEY", "test-key");
  const settings = makeSettings("responses");
  settings.model.model = "gpt-5";
  const model = buildModel(settings);

  expect((model as ChatOpenAIResponses).invocationParams().include).toContain(
    "reasoning.encrypted_content",
  );
});

test("buildModel passes instructions to OpenAI Responses API", () => {
  setEnv("TEST_OPENAI_KEY", "test-key");
  const model = buildModel(makeSettings("responses"), "system\n\nskills");

  expect((model as ChatOpenAIResponses).invocationParams().instructions).toBe(
    "system\n\nskills",
  );
});

test("buildResponsesInstructions appends skills after system prompt", () => {
  expect(buildResponsesInstructions("system", "skills")).toBe(
    "system\n\nskills",
  );
  expect(buildResponsesInstructions("system", "")).toBe("system");
});

test("normalizes missing Responses API output_text annotations", () => {
  const response = {
    output: [
      {
        type: "message",
        content: [{ type: "output_text", text: "hello" }],
      },
    ],
  };

  expect(normalizeResponsesPayload(response as unknown)).toEqual({
    output: [
      {
        type: "message",
        content: [{ type: "output_text", text: "hello", annotations: [] }],
      },
    ],
  });
});

test("normalizes completed Responses API stream events", () => {
  const event = {
    type: "response.completed",
    response: {
      output: [
        {
          type: "message",
          content: [{ type: "output_text", text: "hello" }],
        },
      ],
    },
  };

  const normalized = normalizeResponsesStreamEvent(
    event as Parameters<typeof normalizeResponsesStreamEvent>[0],
  );
  expect(normalized as unknown).toEqual({
    type: "response.completed",
    response: {
      output: [
        {
          type: "message",
          content: [{ type: "output_text", text: "hello", annotations: [] }],
        },
      ],
    },
  });
});
