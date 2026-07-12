import { AIMessage, AIMessageChunk } from "@langchain/core/messages";
import { expect, test } from "bun:test";
import {
  createReasoningStreamState,
  messageReasoning,
  streamedMessageReasoning,
} from "../../src/runtime/content";

test("streamed reasoning separates summary parts and reasoning items", () => {
  const state = createReasoningStreamState();
  const chunks = [
    reasoningChunk({ id: "rs_1", parts: [] }),
    reasoningChunk({ parts: [{ index: 0, text: "**First**" }] }),
    reasoningChunk({ parts: [{ index: 0, text: " detail" }] }),
    reasoningChunk({ parts: [{ index: 1, text: "**Second**" }] }),
    reasoningChunk({ id: "rs_2", parts: [] }),
    reasoningChunk({ parts: [{ index: 0, text: "**Third**" }] }),
  ];

  expect(
    chunks.map((chunk) => streamedMessageReasoning(chunk, state)).join(""),
  ).toBe("**First** detail\n\n**Second**\n\n**Third**");
});

test("persisted reasoning is rebuilt from Responses API summary parts", () => {
  const first = reasoningItem("rs_1", ["**First**", "**Second**"]);
  const second = reasoningItem("rs_2", ["**Third**"]);
  const message = new AIMessage({
    content: [{ type: "reasoning", reasoning: "concatenated" }],
    additional_kwargs: { reasoning: second },
    response_metadata: { output: [first, second] },
  });

  expect(messageReasoning(message)).toBe(
    "**First**\n\n**Second**\n\n**Third**",
  );
});

test("existing summary newlines are not duplicated", () => {
  const message = new AIMessage({
    content: [],
    additional_kwargs: {
      reasoning: reasoningItem("rs_1", ["First\n", "\nSecond"]),
    },
  });

  expect(messageReasoning(message)).toBe("First\n\nSecond");
});

function reasoningChunk({
  id,
  parts,
}: {
  id?: string;
  parts: { index: number; text: string }[];
}) {
  return new AIMessageChunk({
    content: [],
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
  });
}

function reasoningItem(id: string, texts: string[]) {
  return {
    id,
    type: "reasoning",
    summary: texts.map((text) => ({ type: "summary_text", text })),
  };
}
