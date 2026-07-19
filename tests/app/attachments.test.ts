import { afterEach, expect, test } from "bun:test";
import { attachmentPlaceholder, validateAttachmentBatch } from "../../src/app/attachments/contract";
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { createTestDirectory } from "../support/artifacts";
import { join } from "node:path";
import { required } from "../support/database";
import { saveMessageAttachments } from "../../src/app/attachments/storage";
import { testSettings } from "../support/settings";

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { force: true, recursive: true });
  }
});
test("referenced pasted files are saved and placeholders become absolute paths", async () => {
  const root = temporaryDirectory();
  const settings = testSettings(root);
  const sessionId = "session";
  mkdirSync(join(root, "sessions", sessionId), { recursive: true });
  const id = "a1b2c3d4";
  const placeholder = attachmentPlaceholder(id, "../notes.txt");
  const saved = await saveMessageAttachments(
    settings,
    sessionId,
    `读取 ${placeholder} 和 ${placeholder.toUpperCase()}`,
    [{ file: new File(["hello"], "../notes.txt"), id }],
  );
  const [path, repeated] = saved.content.slice("读取 ".length).split(" 和 ");
  const savedPath = required(path);
  expect(savedPath).toContain("/sessions/session/attachments/");
  expect(savedPath).toMatch(/\/attachments\/[0-9a-z]{8}\.txt$/);
  expect(repeated).toBe(savedPath);
  expect(readFileSync(savedPath, "utf8")).toBe("hello");
});
test("unreferenced files are ignored and missing references are rejected", async () => {
  const root = temporaryDirectory();
  const settings = testSettings(root);
  const id = "a1b2c3d4";
  const ignored = await saveMessageAttachments(settings, "session", "hello", [
    { file: new File(["hello"], "notes.txt"), id },
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
test("malformed attachment metadata is rejected explicitly", () => {
  const settings = {
    allowedSuffixes: [".txt"],
    maxSizeBytes: 5,
  };
  expect(() => {
    validateAttachmentBatch([{ size: 1 }], settings);
  }).toThrow("附件缺少有效文件名");
  expect(() => {
    validateAttachmentBatch([{ name: "notes.txt" }], settings);
  }).toThrow("附件 notes.txt 的大小无效");
});
function temporaryDirectory() {
  const directory = createTestDirectory("attachments");
  dirs.push(directory);
  return directory;
}
