import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ChatOpenAIResponses } from "@langchain/openai";
import { afterEach, expect, test } from "bun:test";
import type { FetchLike } from "openai-codex-oauth";
import { buildModel, resolveModelApi } from "../../src/agent";
import {
  parseMainSettings,
  parseModelSettings,
} from "../../src/infrastructure/configuration/settingsSchema";
import { createCodexClientFields } from "../../src/infrastructure/openai/codexAuthentication";
import type { Settings } from "../../src/types";

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("codex adapter does not require OpenAI-compatible connection settings", () => {
  const settings = codexSettings();

  expect(settings.model).toEqual({
    adapter: "codex",
    model: "gpt-5.3-codex",
    reasoning_effort: "high",
    timeoutMs: 120_000,
  });
  expect(Object.hasOwn(settings.model, "api")).toBe(false);
  expect(Object.hasOwn(settings.model, "apiKeyEnv")).toBe(false);
  expect(Object.hasOwn(settings.model, "baseURL")).toBe(false);
});

test("codex adapter builds a Responses API model without an API key env", () => {
  const settings = codexSettings();
  const model = buildModel(settings, "session-1", "system instructions");

  expect(resolveModelApi(settings.model)).toBe("responses");
  expect(model).toBeInstanceOf(ChatOpenAIResponses);
  expect((model as ChatOpenAIResponses).zdrEnabled).toBeTrue();
  expect(
    (
      model as unknown as {
        clientConfig: { maxRetries: number };
      }
    ).clientConfig.maxRetries,
  ).toBe(0);
  expect((model as ChatOpenAIResponses).invocationParams().store).toBeFalse();
  expect((model as ChatOpenAIResponses).invocationParams().instructions).toBe(
    "system instructions",
  );
});

test("codex client reads auth.json and authenticates the Codex endpoint", async () => {
  const root = mkdtempSync(join(tmpdir(), "omity-codex-auth-"));
  const authFilePath = join(root, "auth.json");
  dirs.push(root);
  writeFileSync(
    authFilePath,
    JSON.stringify({
      tokens: {
        access_token: "test-access-token",
        refresh_token: "test-refresh-token",
        account_id: "test-account-id",
      },
    }),
  );
  const requests: CapturedRequest[] = [];
  const upstreamFetch = ((input, init) => {
    requests.push({
      url: input instanceof Request ? input.url : String(input),
      headers: new Headers(init?.headers),
      body: typeof init?.body === "string" ? JSON.parse(init.body) : null,
    });
    return Promise.resolve(
      new Response("{}", {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
  }) as FetchLike;
  const fields = createCodexClientFields({
    authFilePath,
    fetch: upstreamFetch,
  });

  await fields.configuration.fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      authorization: "Bearer placeholder",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-5.3-codex",
      input: "hello",
      max_output_tokens: 100,
    }),
  });

  const request = requests[0];
  expect(request).toBeDefined();
  expect(request?.url).toBe("https://chatgpt.com/backend-api/codex/responses");
  expect(request?.headers.get("authorization")).toBe("Bearer test-access-token");
  expect(request?.headers.get("chatgpt-account-id")).toBe("test-account-id");
  expect(request?.body).toEqual({
    model: "gpt-5.3-codex",
    input: "hello",
    instructions: "",
    store: false,
  });
});

interface CapturedRequest {
  url: string;
  headers: Headers;
  body: unknown;
}

function codexSettings(): Settings {
  const main = parseMainSettings({
    paths: { dataDir: "./data" },
    attachments: { allowedSuffixes: [".txt"], maxSizeBytes: 1024 },
    frontend: {
      draftSaveDelayMs: 1,
      transcriptRefreshIntervalMs: 1,
    },
    host: {
      pollMs: 1,
      pausePollMs: 1,
      idleLogMs: 1,
      recursionLimit: 1,
      shutdownTimeoutMs: 1_000,
    },
    logging: { level: "debug", streamTokens: false },
    leases: { hostTtlMs: 30_000 },
    toolOutput: { maxTokens: 8192 },
    skills: {
      enabled: false,
      directory: "~/.agents/skills",
      skillEnabled: {},
    },
  });
  const model = parseModelSettings({
    profile: "codex",
    profiles: {
      codex: {
        adapter: "codex",
        model: "gpt-5.3-codex",
        reasoning_effort: "high",
        timeoutMs: 120_000,
      },
    },
  });
  return {
    ...main,
    model,
    hooks: [],
    agent: { systemPrompt: "test" },
    skills: { ...main.skills, usagePrompt: "use skills" },
  };
}
