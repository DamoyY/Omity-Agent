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
      { type: "text", text: "screenshot" },
      { type: "image", data, mimeType: "image/png" },
    ],
  });

  expect(toolContentText(content)).toBe("screenshot");
  expect(extractToolImages(content)).toEqual([
    { src: `data:image/png;base64,${data}`, mimeType: "image/png" },
  ]);
});

test("prepares provider-native tool image output for Responses API", () => {
  const src = "data:image/webp;base64,AAAA";
  const message = new ToolMessage({
    content: [
      { type: "text", text: "result" },
      { type: "image_url", image_url: { url: src } },
    ],
    tool_call_id: "call-1",
    name: "screenshot",
  });

  const [prepared] = prepareModelImageMessages([message], "responses");
  if (!prepared) throw new Error("模型图片消息未生成");

  expect(prepared).toBeInstanceOf(ToolMessage);
  expect(prepared.content).toEqual([
    { type: "input_text", text: "result" },
    { type: "input_image", image_url: src, detail: "auto" },
  ]);
  expect((prepared as ToolMessage).tool_call_id).toBe("call-1");
  expect((prepared as ToolMessage).name).toBe("screenshot");
  expect(
    convertMessagesToResponsesInput({
      messages: [prepared],
      zdrEnabled: false,
      model: "test",
    }),
  ).toEqual([
    {
      type: "function_call_output",
      call_id: "call-1",
      output: [
        { type: "input_text", text: "result" },
        { type: "input_image", image_url: src, detail: "auto" },
      ],
    },
  ]);
});

test("adds image notices to Completions tool results", () => {
  const firstSrc = "data:image/png;base64,AAAA";
  const messages = [
    new AIMessage("tools"),
    new ToolMessage({
      content: [
        { type: "text", text: "first" },
        { type: "image_url", image_url: { url: firstSrc } },
      ],
      tool_call_id: "call-1",
    }),
    new ToolMessage({
      content: [
        {
          type: "image",
          source_type: "base64",
          data: "BBBB",
          mime_type: "image/jpeg",
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
    { role: "assistant", content: "tools" },
    {
      role: "tool",
      content: "first\n\n工具返回了 1 张图片，但 Completions API 不支持工具返回图片给模型。",
      tool_call_id: "call-1",
    },
    {
      role: "tool",
      content: "工具返回了 1 张图片，但 Completions API 不支持工具返回图片给模型。",
      tool_call_id: "call-2",
    },
    { role: "assistant", content: "next" },
  ]);
});
