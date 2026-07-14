import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "bun:test";
import { attachmentPlaceholder, validateAttachmentBatch } from "../../src/app/attachments/contract";
import { saveMessageAttachments } from "../../src/app/attachments/storage";
import { testSettings } from "../support/settings";
import { required } from "../support/database";
const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});
test("referenced pasted files are saved and placeholders become absolute paths", async () => {
  const root = temporaryDirectory();
  const settings = testSettings(root);
  const sessionId = "session";
  mkdirSync(join(root, "sessions", sessionId), { recursive: true });
  const id = "123e4567-e89b-42d3-a456-426614174000";
  const placeholder = attachmentPlaceholder(id, "../notes.txt");
  const saved = await saveMessageAttachments(
    settings,
    sessionId,
    `读取 ${placeholder} 和 ${placeholder.toUpperCase()}`,
    [{ id, file: new File(["hello"], "../notes.txt") }],
  );
  const [path, repeated] = saved.content.slice("读取 ".length).split(" 和 ");
  const savedPath = required(path);
  expect(savedPath).toContain("/sessions/session/attachments/");
  expect(savedPath.endsWith("-notes.txt")).toBe(true);
  expect(repeated).toBe(savedPath);
  expect(readFileSync(savedPath, "utf8")).toBe("hello");
});
test("unreferenced files are ignored and missing references are rejected", async () => {
  const root = temporaryDirectory();
  const settings = testSettings(root);
  const id = "123e4567-e89b-42d3-a456-426614174000";
  const ignored = await saveMessageAttachments(settings, "session", "hello", [
    { id, file: new File(["hello"], "notes.txt") },
  ]);
  expect(ignored.content).toBe("hello");
  expect(() =>
    saveMessageAttachments(settings, "session", attachmentPlaceholder(id, "notes.txt"), []),
  ).toThrow("消息引用的附件不存在");
});
test("attachment whitelist and combined size limit are enforced", () => {
  const settings = {
    allowedSuffixes: [".txt"],
    maxSizeBytes: 5,
  };
  expect(() => {
    validateAttachmentBatch([new File(["x"], "notes.exe")], settings);
  }).toThrow("不允许粘贴后缀");
  expect(() => {
    validateAttachmentBatch([new File(["123"], "a.txt"), new File(["456"], "b.txt")], settings);
  }).toThrow("附件总大小超过上限");
});
function temporaryDirectory() {
  const directory = mkdtempSync(join(tmpdir(), "agent-attachments-"));
  dirs.push(directory);
  return directory;
}
