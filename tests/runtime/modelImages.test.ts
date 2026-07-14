import { AIMessage, ToolMessage } from "@langchain/core/messages";
import {
  convertMessagesToCompletionsMessageParams,
  convertMessagesToResponsesInput,
} from "@langchain/openai";
import { expect, test } from "bun:test";
import {
  extractToolImages,
  prepareModelImageMessages,
  toolContentText,
} from "../../src/runtime/modelImages";
test("extracts unbounded MCP base64 images and their text", () => {
  const data = "A".repeat(1024 * 1024);
  const content = JSON.stringify({
    content: [
      { text: "screenshot", type: "text" },
      { data, mimeType: "image/png", type: "image" },
    ],
  });
  expect(toolContentText(content)).toBe("screenshot");
  expect(extractToolImages(content)).toEqual([
    { mimeType: "image/png", src: `data:image/png;base64,${data}` },
  ]);
});
test("prepares provider-native tool image output for Responses API", () => {
  const src = "data:image/webp;base64,AAAA";
  const message = new ToolMessage({
    content: [
      { text: "result", type: "text" },
      { image_url: { url: src }, type: "image_url" },
    ],
    name: "screenshot",
    tool_call_id: "call-1",
  });
  const [prepared] = prepareModelImageMessages([message], "responses");
  if (!prepared) {
    throw new Error("模型图片消息未生成");
  }
  expect(prepared).toBeInstanceOf(ToolMessage);
  expect(prepared.content).toEqual([
    { text: "result", type: "input_text" },
    { detail: "auto", image_url: src, type: "input_image" },
  ]);
  expect((prepared as ToolMessage).tool_call_id).toBe("call-1");
  expect((prepared as ToolMessage).name).toBe("screenshot");
  expect(
    convertMessagesToResponsesInput({
      messages: [prepared],
      model: "test",
      zdrEnabled: false,
    }),
  ).toEqual([
    {
      call_id: "call-1",
      output: [
        { text: "result", type: "input_text" },
        { detail: "auto", image_url: src, type: "input_image" },
      ],
      type: "function_call_output",
    },
  ]);
});
test("adds image notices to Completions tool results", () => {
  const firstSrc = "data:image/png;base64,AAAA";
  const messages = [
    new AIMessage("tools"),
    new ToolMessage({
      content: [
        { text: "first", type: "text" },
        { image_url: { url: firstSrc }, type: "image_url" },
      ],
      tool_call_id: "call-1",
    }),
    new ToolMessage({
      content: [
        {
          data: "BBBB",
          mime_type: "image/jpeg",
          source_type: "base64",
          type: "image",
        },
      ],
      tool_call_id: "call-2",
    }),
    new AIMessage("next"),
  ];
  const prepared = prepareModelImageMessages(messages, "completions");
  expect(prepared.map((message) => message.type)).toEqual(["ai", "tool", "tool", "ai"]);
  expect(prepared[1]?.content).toBe(
    "first\n\n工具返回了 1 张图片，但 Completions API 不支持工具返回图片给模型。",
  );
  expect(prepared[2]?.content).toBe(
    "工具返回了 1 张图片，但 Completions API 不支持工具返回图片给模型。",
  );
  expect(convertMessagesToCompletionsMessageParams({ messages: prepared })).toEqual([
    { content: "tools", role: "assistant" },
    {
      content: "first\n\n工具返回了 1 张图片，但 Completions API 不支持工具返回图片给模型。",
      role: "tool",
      tool_call_id: "call-1",
    },
    {
      content: "工具返回了 1 张图片，但 Completions API 不支持工具返回图片给模型。",
      role: "tool",
      tool_call_id: "call-2",
    },
    { content: "next", role: "assistant" },
  ]);
});
