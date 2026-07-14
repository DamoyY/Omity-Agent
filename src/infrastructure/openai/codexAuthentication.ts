import { homedir } from "node:os";
import { join } from "node:path";
import { createCodexOAuthFetch, DEFAULT_CODEX_BASE_URL, type FetchLike } from "openai-codex-oauth";
import { createCodexAuthFileStore } from "openai-codex-oauth/node";
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
      maxRetries: 0,
      fetch: createCodexOAuthFetch({
        fetch: options.fetch,
        tokenStore: createCodexAuthFileStore({ authFilePath }),
      }),
    },
  };
}
let sharedFields: ReturnType<typeof createCodexClientFields> | undefined;
export function codexClientFields() {
  sharedFields ??= createCodexClientFields();
  return sharedFields;
}
