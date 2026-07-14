import { AIMessage, AIMessageChunk } from "@langchain/core/messages";
import {
  createReasoningStreamState,
  messageReasoning,
  streamedMessageReasoning,
} from "../../src/runtime/content";
import { expect, test } from "bun:test";
test("streamed reasoning separates summary parts and reasoning items", () => {
  const state = createReasoningStreamState();
  const chunks = [
    reasoningChunk({ id: "rs_1", parts: [] }),
    reasoningChunk({ parts: [{ index: 0, text: "**First**" }] }),
    reasoningChunk({ parts: [{ index: 0, text: " detail" }] }),
    reasoningChunk({ parts: [{ index: 1, text: "**Second**" }] }),
    reasoningChunk({ id: "rs_2", parts: [] }),
    reasoningChunk({ parts: [{ index: 0, text: "**Third**" }] }),
    new AIMessageChunk({ content: [] }),
  ];
  expect(chunks.map((chunk) => streamedMessageReasoning(chunk, state)).join("")).toBe(
    "**First** detail\n\n**Second**\n\n**Third**",
  );
});
test("persisted reasoning is rebuilt from Responses API summary parts", () => {
  const first = reasoningItem("rs_1", ["**First**", "**Second**"]);
  const second = reasoningItem("rs_2", ["**Third**"]);
  const message = new AIMessage({
    additional_kwargs: { reasoning: second },
    content: [{ reasoning: "concatenated", type: "reasoning" }],
    response_metadata: { output: [first, second] },
  });
  expect(messageReasoning(message)).toBe("**First**\n\n**Second**\n\n**Third**");
});
test("existing summary newlines are not duplicated", () => {
  const message = new AIMessage({
    additional_kwargs: {
      reasoning: reasoningItem("rs_1", ["First\n", "\nSecond"]),
    },
    content: [],
  });
  expect(messageReasoning(message)).toBe("First\n\nSecond");
});
test("adjacent bold summaries in one part are separated across deltas", () => {
  const state = createReasoningStreamState();
  const chunks = [
    reasoningChunk({ parts: [{ index: 0, text: "**Planning*" }] }),
    reasoningChunk({ parts: [{ index: 0, text: "***Refining**" }] }),
    new AIMessageChunk({ content: [] }),
  ];
  expect(chunks.map((chunk) => streamedMessageReasoning(chunk, state)).join("")).toBe(
    "**Planning**\n\n**Refining**",
  );
});
test("persisted adjacent bold summaries in one part are separated", () => {
  const message = new AIMessage({
    additional_kwargs: {
      reasoning: reasoningItem("rs_1", ["**Planning****Refining**"]),
    },
    content: [],
  });
  expect(messageReasoning(message)).toBe("**Planning**\n\n**Refining**");
});
function reasoningChunk({ id, parts }: { id?: string; parts: { index: number; text: string }[] }) {
  return new AIMessageChunk({
    additional_kwargs: {
      reasoning: {
        type: "reasoning",
        ...(id ? { id } : {}),
        summary: parts.map((part) => ({
          ...part,
          type: "summary_text",
        })),
      },
    },
    content: [],
  });
}
function reasoningItem(id: string, texts: string[]) {
  return {
    id,
    summary: texts.map((text) => ({ text, type: "summary_text" })),
    type: "reasoning",
  };
}
