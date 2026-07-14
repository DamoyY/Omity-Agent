import { afterEach, expect, test } from "bun:test";
import { parseClientIntent, runClient } from "../../src/client";
import { AgentDatabase } from "../../src/infrastructure/database/agentDatabase";
import { createTestDirectory } from "../support/artifacts";
import { loadSettings } from "../../src/infrastructure/configuration/loadSettings";
import { rmSync } from "node:fs";
import { sessionPaths } from "../../src/infrastructure/configuration/sessionPaths";
import { writeTestConfiguration } from "../support/configuration";

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { force: true, recursive: true });
  }
});
test("client intent parses messages and controls", () => {
  expect(parseClientIntent(["append=你好"])).toEqual({ append: "你好" });
  expect(parseClientIntent(["pause"])).toEqual({ control: "pause" });
  expect(parseClientIntent(["continue"])).toEqual({ control: "running" });
  expect(parseClientIntent(["resume"])).toEqual({ control: "running" });
  expect(parseClientIntent(["cancel"])).toEqual({ control: "cancel" });
});
test("client cancel during pause preserves pause state", () => {
  const { dbPath, root } = makeSession("123");
  const db = new AgentDatabase(dbPath);
  db.setControl("123", "pause");
  db.close();
  runClient({ control: "cancel", sessionId: "123" }, root);
  const reopened = new AgentDatabase(dbPath);
  expect(reopened.control("123")).toBe("pause_cancel");
  reopened.close();
});
function makeSession(sessionId: string) {
  const root = createTestDirectory("client");
  dirs.push(root);
  writeTestConfiguration(root);
  const paths = sessionPaths(loadSettings(root), sessionId);
  const db = new AgentDatabase(paths.dbPath);
  db.createSession(sessionId, root);
  db.close();
  return { dbPath: paths.dbPath, root };
}
