import { AIMessage, HumanMessage } from "@langchain/core/messages";
import { afterEach, expect, test } from "bun:test";
import { loadTranscript } from "../../src/app/transcript";
import { cleanupDatabaseDirs, makeDb, workspace } from "../support/database";

afterEach(cleanupDatabaseDirs);

test("transcript exposes Responses API token and cache usage", () => {
  const db = makeDb();
  db.resetSession("usage-session", workspace);
  db.syncHistory("usage-session", [
    new HumanMessage("问题"),
    new AIMessage({
      content: "答案",
      usage_metadata: {
        input_tokens: 1200,
        output_tokens: 300,
        total_tokens: 1500,
        input_token_details: { cache_read: 900 },
      },
    }),
  ]);

  const transcript = loadTranscript(db, "usage-session");

  expect(transcript.view.at(-1)?.usage).toEqual({
    inputTokens: 1200,
    outputTokens: 300,
    cacheReadTokens: 900,
  });
  db.close();
});
