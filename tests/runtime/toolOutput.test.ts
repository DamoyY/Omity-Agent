import { afterEach, expect, test } from "bun:test";
import { readFileSync, readdirSync, rmSync } from "node:fs";
import { ToolMessage } from "@langchain/core/messages";
import { countTokens } from "../../src/runtime/tokenizer";
import { createTestDirectory } from "../support/artifacts";
import { join } from "node:path";
import { redirectLargeToolOutput } from "../../src/runtime/largeOutput";

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { force: true, recursive: true });
  }
});
test("normalizes MCP text content before size handling", async () => {
  const root = makeDir();
  const short = "短输出";
  const shortMessage = new ToolMessage({
    content: JSON.stringify({ content: [{ text: short, type: "text" }] }),
    tool_call_id: "call-0",
  });
  const original = "结构化长输出 ".repeat(100);
  const message = new ToolMessage({
    content: JSON.stringify({
      content: [{ text: original, type: "text" }],
      structuredContent: { ignored: true },
    }),
    name: "demo_tool",
    tool_call_id: "call-1",
  });
  const normalized = await redirectLargeToolOutput(shortMessage, {
    dataDir: root,
    maxTokens: countTokens(short),
    sessionId: "demo-session",
  });
  const redirected = await redirectLargeToolOutput(message, {
    dataDir: root,
    maxTokens: 1,
    sessionId: "demo-session",
  });
  const outputPath = onlyOutputPath(root);
  expect(normalized.content).toBe(short);
  expect(readFileSync(outputPath, "utf8")).toBe(original);
  expect(redirected.content).toBe(
    `工具输出过长（${countTokens(original).toString()} tokens），无法直接查看。\n原始输出内容已保存于：${outputPath}，请按需检索其中片段。`,
  );
  expect(redirected.name).toBe("demo_tool");
});
test("accepts hook call IDs when writing large output", async () => {
  const root = makeDir();
  const outputId = "omity-hook:session/thread:tool";
  const original = "long hook output";
  const redirected = await redirectLargeToolOutput(
    new ToolMessage({ content: original, tool_call_id: outputId }),
    {
      dataDir: root,
      maxTokens: 1,
      sessionId: "demo-session",
    },
  );
  const outputPath = onlyOutputPath(root);
  expect(readFileSync(outputPath, "utf8")).toBe(original);
  expect(redirected.content).toContain(outputPath);
});
test("uses compact URL-safe large output file names", async () => {
  const root = makeDir();
  await redirectLargeToolOutput(new ToolMessage({ content: "long output", tool_call_id: "call" }), {
    dataDir: root,
    maxTokens: 1,
    sessionId: "demo-session",
  });
  const names = readdirSync(join(root, "sessions", "demo-session", "large_output"));
  expect(names).toHaveLength(1);
  expect(names[0]).toMatch(/^[0-9a-z]{8}\.txt$/);
});
test("keeps MCP images outside the text size limit", async () => {
  const root = makeDir();
  const imageData = "A".repeat(1024 * 1024);
  const imageMessage = new ToolMessage({
    content: JSON.stringify({
      content: [{ data: imageData, mimeType: "image/png", type: "image" }],
    }),
    tool_call_id: "call-2",
  });
  const errorMessage = new ToolMessage({
    content: JSON.stringify({
      content: [{ text: "MCP 工具报错".repeat(100), type: "text" }],
      isError: true,
    }),
    tool_call_id: "call-3",
  });
  const imageRedirected = await redirectLargeToolOutput(imageMessage, {
    dataDir: root,
    maxTokens: 1,
    sessionId: "demo",
  });
  const errorRedirected = await redirectLargeToolOutput(errorMessage, {
    dataDir: root,
    maxTokens: 1,
    sessionId: "demo",
  });
  expect(imageRedirected.content).toEqual([
    { data: imageData, mimeType: "image/png", type: "image" },
  ]);
  expect(errorRedirected).toBe(errorMessage);
});
test("redirects mixed output text without removing its image", async () => {
  const root = makeDir();
  const text = "long text ".repeat(100);
  const image = {
    data: "A".repeat(1024 * 1024),
    mime_type: "image/png",
    source_type: "base64",
    type: "image",
  };
  const redirected = await redirectLargeToolOutput(
    new ToolMessage({
      content: [{ text, type: "text" }, image],
      tool_call_id: "call-4",
    }),
    {
      dataDir: root,
      maxTokens: 1,
      sessionId: "demo",
    },
  );
  expect(redirected.content).toEqual([
    { text: expect.stringContaining("工具输出过长"), type: "text" },
    image,
  ]);
});
function makeDir() {
  const dir = createTestDirectory("large-output");
  dirs.push(dir);
  return dir;
}
function onlyOutputPath(root: string) {
  const directory = join(root, "sessions", "demo-session", "large_output");
  const [name] = readdirSync(directory);
  return join(directory, name ?? "");
}
