import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ToolMessage } from "@langchain/core/messages";
import { afterEach, expect, test } from "bun:test";
import {
  countTokens,
  redirectLargeToolOutput,
} from "../../src/runtime/largeOutput";

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("normalizes MCP text content before size handling", async () => {
  const root = makeDir();
  const short = "短输出";
  const shortMessage = new ToolMessage({
    content: JSON.stringify({ content: [{ type: "text", text: short }] }),
    tool_call_id: "call-0",
  });
  const original = "结构化长输出 ".repeat(100);
  const message = new ToolMessage({
    content: JSON.stringify({
      content: [{ type: "text", text: original }],
      structuredContent: { ignored: true },
    }),
    tool_call_id: "call-1",
    name: "demo_tool",
  });

  const normalized = await redirectLargeToolOutput(shortMessage, {
    dataDir: root,
    maxTokens: countTokens(short),
    sessionId: "demo-session",
    outputId: "call-0",
  });
  const redirected = await redirectLargeToolOutput(message, {
    dataDir: root,
    maxTokens: 1,
    sessionId: "demo-session",
    outputId: "call-1",
  });
  const outputPath = join(
    root,
    "sessions",
    "demo-session",
    "large_output",
    `${outputFileId("call-1")}.txt`,
  );

  expect(normalized.content).toBe(short);
  expect(readFileSync(outputPath, "utf8")).toBe(original);
  expect(redirected.content).toBe(
    `工具输出过长（${countTokens(original).toString()} tokens），无法直接查看。原始输出内容已保存于：${outputPath}`,
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
      outputId,
    },
  );
  const outputPath = join(
    root,
    "sessions",
    "demo-session",
    "large_output",
    `${outputFileId(outputId)}.txt`,
  );

  expect(readFileSync(outputPath, "utf8")).toBe(original);
  expect(redirected.content).toContain(outputPath);
});

test("uses compact URL-safe large output file names", async () => {
  const root = makeDir();
  await redirectLargeToolOutput(
    new ToolMessage({ content: "long output", tool_call_id: "call" }),
    {
      dataDir: root,
      maxTokens: 1,
      sessionId: "demo-session",
    },
  );
  const names = readdirSync(
    join(root, "sessions", "demo-session", "large_output"),
  );

  expect(names).toHaveLength(1);
  expect(names[0]).toMatch(/^[A-Za-z0-9_-]{22}\.txt$/);
});

test("keeps MCP images outside the text size limit", async () => {
  const root = makeDir();
  const imageData = "A".repeat(1024 * 1024);
  const imageMessage = new ToolMessage({
    content: JSON.stringify({
      content: [{ type: "image", data: imageData, mimeType: "image/png" }],
    }),
    tool_call_id: "call-2",
  });
  const errorMessage = new ToolMessage({
    content: JSON.stringify({
      isError: true,
      content: [{ type: "text", text: "MCP 工具报错".repeat(100) }],
    }),
    tool_call_id: "call-3",
  });

  const imageRedirected = await redirectLargeToolOutput(imageMessage, {
    dataDir: root,
    maxTokens: 1,
    sessionId: "demo",
    outputId: "call-2",
  });
  const errorRedirected = await redirectLargeToolOutput(errorMessage, {
    dataDir: root,
    maxTokens: 1,
    sessionId: "demo",
    outputId: "call-3",
  });

  expect(imageRedirected.content).toEqual([
    { type: "image", data: imageData, mimeType: "image/png" },
  ]);
  expect(errorRedirected).toBe(errorMessage);
});

test("redirects mixed output text without removing its image", async () => {
  const root = makeDir();
  const text = "long text ".repeat(100);
  const image = {
    type: "image",
    source_type: "base64",
    data: "A".repeat(1024 * 1024),
    mime_type: "image/png",
  };
  const redirected = await redirectLargeToolOutput(
    new ToolMessage({
      content: [{ type: "text", text }, image],
      tool_call_id: "call-4",
    }),
    {
      dataDir: root,
      maxTokens: 1,
      sessionId: "demo",
      outputId: "call-4",
    },
  );

  expect(redirected.content).toEqual([
    { type: "text", text: expect.stringContaining("工具输出过长") },
    image,
  ]);
});

function makeDir() {
  const dir = mkdtempSync(join(tmpdir(), "agent-large-output-"));
  dirs.push(dir);
  return dir;
}

function outputFileId(outputId: string) {
  return createHash("sha256")
    .update(outputId)
    .digest()
    .subarray(0, 16)
    .toString("base64url");
}
