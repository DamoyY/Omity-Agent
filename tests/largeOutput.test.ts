import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ToolMessage } from "@langchain/core/messages";
import { afterEach, expect, test } from "bun:test";
import {
  countTokens,
  redirectLargeToolOutput,
} from "../src/runtime/largeOutput";

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
    }) as ToolMessage["content"],
    tool_call_id: "call-1",
    name: "demo_tool",
  });

  const normalized = await redirectLargeToolOutput(shortMessage, {
    dataDir: root,
    maxTokens: countTokens(short),
    sessionId: "demo/session",
    outputId: "call-0",
  });
  const redirected = await redirectLargeToolOutput(message, {
    dataDir: root,
    maxTokens: 1,
    sessionId: "demo/session",
    outputId: "call-1",
  });
  const outputPath = join(
    root,
    "sessions",
    "demo_session",
    "large_output",
    "call-1.txt",
  );

  expect(normalized.content).toBe(short);
  expect(readFileSync(outputPath, "utf8")).toBe(original);
  expect(redirected.content).toBe(
    `输出过长（${countTokens(original)} tokens），无法直接查看。原始输出内容已保存于：${outputPath}`,
  );
  expect(redirected.name).toBe("demo_tool");
});

test("keeps MCP image output and MCP error result unchanged", async () => {
  const root = makeDir();
  const imageMessage = new ToolMessage({
    content: JSON.stringify({
      content: [{ type: "image", data: "AAAA", mimeType: "image/png" }],
    }) as ToolMessage["content"],
    tool_call_id: "call-2",
  });
  const errorMessage = new ToolMessage({
    content: JSON.stringify({
      isError: true,
      content: [{ type: "text", text: "MCP 工具报错".repeat(100) }],
    }) as ToolMessage["content"],
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
