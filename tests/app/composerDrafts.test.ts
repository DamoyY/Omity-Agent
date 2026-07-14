import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "bun:test";
import {
  clearSessionDraft,
  readSessionDraft,
  writeSessionDraft,
} from "../../src/app/composerDraft";
import { sessionPaths } from "../../src/infrastructure/configuration/sessionPaths";
import { AgentDatabase } from "../../src/infrastructure/database/agentDatabase";
import { testSettings } from "../support/settings";
const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});
test("session composer drafts survive database reopen", () => {
  const fixture = createSession();
  expect(writeSessionDraft(fixture.settings, "session", "draft", 1)).toEqual({
    revision: 1,
  });
  expect(readSessionDraft(fixture.settings, "session")).toEqual({
    content: "draft",
    revision: 1,
  });
});
test("stale saves cannot overwrite newer composer drafts", () => {
  const fixture = createSession();
  writeSessionDraft(fixture.settings, "session", "newer", 2);
  writeSessionDraft(fixture.settings, "session", "older", 1);
  expect(readSessionDraft(fixture.settings, "session")).toEqual({
    content: "newer",
    revision: 2,
  });
});
test("sending clears only the composer revision it submitted", () => {
  const fixture = createSession();
  writeSessionDraft(fixture.settings, "session", "submitted", 1);
  writeSessionDraft(fixture.settings, "session", "next message", 2);
  clearSessionDraft(fixture.settings, "session", 1);
  expect(readSessionDraft(fixture.settings, "session").content).toBe("next message");
  clearSessionDraft(fixture.settings, "session", 2);
  expect(readSessionDraft(fixture.settings, "session")).toEqual({
    content: null,
    revision: 2,
  });
});
test("a late save cannot restore a draft after sending", () => {
  const fixture = createSession();
  clearSessionDraft(fixture.settings, "session", 3);
  writeSessionDraft(fixture.settings, "session", "stale", 3);
  expect(readSessionDraft(fixture.settings, "session")).toEqual({
    content: null,
    revision: 3,
  });
  writeSessionDraft(fixture.settings, "session", "next message", 4);
  expect(readSessionDraft(fixture.settings, "session")).toEqual({
    content: "next message",
    revision: 4,
  });
});
function createSession() {
  const root = mkdtempSync(join(tmpdir(), "composer-draft-"));
  dirs.push(root);
  const settings = testSettings(root);
  const database = new AgentDatabase(sessionPaths(settings, "session").dbPath);
  database.createSession("session", root);
  database.close();
  return { settings };
}
