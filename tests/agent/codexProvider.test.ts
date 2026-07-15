import { afterEach, expect, test } from "bun:test";
import { buildModel, resolveModelApi } from "../../src/agent";
import {
  parseMainSettings,
  parseModelSettings,
} from "../../src/infrastructure/configuration/settingsSchema";
import { rmSync, writeFileSync } from "node:fs";
import { ChatOpenAIResponses } from "@langchain/openai";
import type { FetchLike } from "openai-codex-oauth";
import type { Settings } from "../../src/types";
import { createCodexClientFields } from "../../src/infrastructure/openai/codexAuthentication";
import { createTestDirectory } from "../support/artifacts";
import { join } from "node:path";

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { force: true, recursive: true });
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
  if (!(model instanceof ChatOpenAIResponses)) {
    throw new Error("Codex adapter did not build a Responses model");
  }
  expect(model.zdrEnabled).toBeTrue();
  expect(clientMaxRetries(model)).toBe(0);
  expect(model.invocationParams().store).toBeFalse();
  expect(model.invocationParams().instructions).toBe("system instructions");
});
test("codex client reads auth.json and authenticates the Codex endpoint", async () => {
  const root = createTestDirectory("codex-auth");
  const authFilePath = join(root, "auth.json");
  dirs.push(root);
  writeFileSync(
    authFilePath,
    JSON.stringify({
      tokens: {
        access_token: "test-access-token",
        account_id: "test-account-id",
        refresh_token: "test-refresh-token",
      },
    }),
  );
  const requests: CapturedRequest[] = [];
  const upstreamFetch = Object.assign(
    (input: URL | RequestInfo, init?: BunFetchRequestInit | RequestInit) => {
      requests.push({
        body: typeof init?.body === "string" ? JSON.parse(init.body) : null,
        headers: new Headers(init?.headers),
        url: input instanceof Request ? input.url : String(input),
      });
      return Promise.resolve(
        new Response("{}", {
          headers: { "content-type": "application/json" },
          status: 200,
        }),
      );
    },
    { preconnect: () => undefined },
  ) satisfies FetchLike;
  const fields = createCodexClientFields({
    authFilePath,
    fetch: upstreamFetch,
  });
  await fields.configuration.fetch("https://api.openai.com/v1/responses", {
    body: JSON.stringify({
      input: "hello",
      max_output_tokens: 100,
      model: "gpt-5.3-codex",
    }),
    headers: {
      authorization: "Bearer placeholder",
      "content-type": "application/json",
    },
    method: "POST",
  });
  const [request] = requests;
  expect(request).toBeDefined();
  expect(request?.url).toBe("https://chatgpt.com/backend-api/codex/responses");
  expect(request?.headers.get("authorization")).toBe("Bearer test-access-token");
  expect(request?.headers.get("chatgpt-account-id")).toBe("test-account-id");
  expect(request?.body).toEqual({
    input: "hello",
    instructions: "",
    model: "gpt-5.3-codex",
    store: false,
  });
});
interface CapturedRequest {
  url: string;
  headers: Headers;
  body: unknown;
}
function clientMaxRetries(value: unknown) {
  if (!isRecord(value) || !isRecord(value["clientConfig"])) {
    throw new Error("Responses model client config is unavailable");
  }
  const { maxRetries } = value["clientConfig"];
  if (typeof maxRetries !== "number") {
    throw new Error("Responses model maxRetries is invalid");
  }
  return maxRetries;
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
function codexSettings(): Settings {
  const main = parseMainSettings({
    access: {
      challengeTtlMs: 300_000,
      loginRateLimit: { attempts: 10, windowMs: 60_000 },
      publicOrigin: "https://omity.example.test",
      sessionTtlMs: 43_200_000,
      trustedProxies: ["127.0.0.1/32"],
    },
    attachments: { allowedSuffixes: [".txt"], maxSizeBytes: 1024 },
    frontend: {
      draftSaveDelayMs: 1,
      transcriptRefreshIntervalMs: 1,
    },
    host: {
      idleLogMs: 1,
      pausePollMs: 1,
      pollMs: 1,
      recursionLimit: 1,
      shutdownTimeoutMs: 1000,
    },
    leases: { hostTtlMs: 30_000 },
    logging: { level: "debug", streamTokens: false },
    paths: { dataDir: "./data" },
    server: { host: "127.0.0.1", port: 3030 },
    skills: {
      directory: "~/.agents/skills",
      enabled: false,
      skillEnabled: {},
    },
    toolOutput: { maxTokens: 8192 },
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
    agent: { systemPrompt: "test" },
    hooks: [],
    model,
    skills: { ...main.skills, usagePrompt: "use skills" },
  };
}
