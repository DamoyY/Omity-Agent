import { QueryClient } from "@tanstack/react-query";
import { expect, test } from "bun:test";
import {
  addOptimisticUser,
  confirmOptimisticUser,
  removeOptimisticUser,
} from "../../../src/app/frontend/services/transcript/optimistic";
import {
  transcriptKey,
  type TranscriptData,
} from "../../../src/app/frontend/services/queries";
import {
  appendTranscriptEvents,
  emptyTranscriptData,
  rebuildTranscript,
} from "../../../src/app/frontend/services/transcript/cache";

test("optimistic user appears before a transcript has loaded", () => {
  const client = new QueryClient();
  addOptimisticUser(client, "session", "hello");

  const data = transcript(client);
  expect(data.view).toMatchObject([
    { role: "user", content: "hello", parts: [{ content: "hello" }] },
  ]);
});

test("send confirmation converts optimistic user into a pending queue item", () => {
  const client = new QueryClient();
  client.setQueryData<TranscriptData>(transcriptKey("session"), empty());
  const key = addOptimisticUser(client, "session", "hello");

  confirmOptimisticUser(client, "session", key, 7, "hello");

  const data = transcript(client);
  expect(data.queue).toMatchObject([
    { id: 7, content: "hello", status: "pending" },
  ]);
  expect(data.view).toMatchObject([{ key: "queue-7", content: "hello" }]);
});

test("confirmation removes optimistic duplicate after SSE persisted the user", () => {
  const client = new QueryClient();
  client.setQueryData<TranscriptData>(transcriptKey("session"), empty());
  const key = addOptimisticUser(client, "session", "hello");
  client.setQueryData<TranscriptData>(transcriptKey("session"), (current) =>
    rebuildTranscript(current ?? empty(), {
      queue: [
        {
          id: 7,
          content: "",
          status: "running",
          error: null,
          userMessageId: 11,
        },
      ],
      messages: [
        {
          id: 11,
          sourceId: "human-11",
          role: "user",
          content: "hello",
          reasoning: "",
          images: [],
          queueId: 7,
          toolCalls: [],
          createdAt: 1,
        },
      ],
    }),
  );

  confirmOptimisticUser(client, "session", key, 7, "hello");

  expect(transcript(client).view.map(({ key: itemKey }) => itemKey)).toEqual([
    "message-11",
  ]);
});

test("failed send removes its optimistic user", () => {
  const client = new QueryClient();
  client.setQueryData<TranscriptData>(transcriptKey("session"), empty());
  const key = addOptimisticUser(client, "session", "hello");

  removeOptimisticUser(client, "session", key);

  expect(transcript(client).view).toEqual([]);
});

test("stream deltas preserve optimistic users", () => {
  const client = new QueryClient();
  client.setQueryData<TranscriptData>(transcriptKey("session"), empty());
  addOptimisticUser(client, "session", "hello");

  client.setQueryData<TranscriptData>(transcriptKey("session"), (current) =>
    appendTranscriptEvents(current ?? empty(), [
      {
        id: 1,
        message: "assistant_text_delta",
        payload: {
          kind: "assistant_text_delta",
          queueId: 1,
          text: "answer",
        },
      },
    ]),
  );

  expect(transcript(client).view.at(-1)).toMatchObject({
    role: "user",
    content: "hello",
  });
});

function transcript(client: QueryClient) {
  const data = client.getQueryData<TranscriptData>(transcriptKey("session"));
  if (!data) throw new Error("transcript cache missing");
  return data;
}

function empty(): TranscriptData {
  return emptyTranscriptData();
}
