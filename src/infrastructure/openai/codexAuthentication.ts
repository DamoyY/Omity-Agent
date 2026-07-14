import { DEFAULT_CODEX_BASE_URL, type FetchLike, createCodexOAuthFetch } from "openai-codex-oauth";
import { createCodexAuthFileStore } from "openai-codex-oauth/node";
import { homedir } from "node:os";
import { join } from "node:path";

interface CodexClientOptions {
  authFilePath?: string;
  fetch?: FetchLike;
}
export function createCodexClientFields(options: CodexClientOptions = {}) {
  const authFilePath = options.authFilePath ?? join(homedir(), ".codex", "auth.json");
  return {
    apiKey: "codex-oauth",
    configuration: {
      baseURL: DEFAULT_CODEX_BASE_URL,
      fetch: createCodexOAuthFetch({
        fetch: options.fetch,
        tokenStore: createCodexAuthFileStore({ authFilePath }),
      }),
      maxRetries: 0,
    },
  };
}
let sharedFields: ReturnType<typeof createCodexClientFields> | undefined;
export function codexClientFields() {
  sharedFields ??= createCodexClientFields();
  return sharedFields;
}
