import { mkdtempSync, readFileSync, rmSync } from "node:fs";
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
    `${createHash("sha256").update("call-1").digest("hex")}.txt`,
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
    `${createHash("sha256").update(outputId).digest("hex")}.txt`,
  );

  expect(readFileSync(outputPath, "utf8")).toBe(original);
  expect(redirected.content).toContain(outputPath);
});

test("keeps MCP image output and MCP error result unchanged", async () => {
  const root = makeDir();
  const imageMessage = new ToolMessage({
    content: JSON.stringify({
      content: [{ type: "image", data: "AAAA", mimeType: "image/png" }],
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

  expect(imageRedirected).toBe(imageMessage);
  expect(errorRedirected).toBe(errorMessage);
});

function makeDir() {
  const dir = mkdtempSync(join(tmpdir(), "agent-large-output-"));
  dirs.push(dir);
  return dir;
}
