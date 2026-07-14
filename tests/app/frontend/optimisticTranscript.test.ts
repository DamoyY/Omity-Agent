import { type TranscriptData, transcriptKey } from "../../../src/app/frontend/services/queries";
import {
  addOptimisticUser,
  confirmOptimisticUser,
  removeOptimisticUser,
} from "../../../src/app/frontend/services/transcript/optimistic";
import {
  appendTranscriptEvents,
  emptyTranscriptData,
  rebuildTranscript,
} from "../../../src/app/frontend/services/transcript/cache";
import { expect, test } from "bun:test";
import { QueryClient } from "@tanstack/react-query";
test("optimistic user appears before a transcript has loaded", () => {
  const client = new QueryClient();
  addOptimisticUser(client, "session", "hello");
  const data = transcript(client);
  expect(data.view).toMatchObject([
    { content: "hello", parts: [{ content: "hello" }], role: "user" },
  ]);
});
test("send confirmation converts optimistic user into a pending queue item", () => {
  const client = new QueryClient();
  client.setQueryData<TranscriptData>(transcriptKey("session"), empty());
  const key = addOptimisticUser(client, "session", "hello");
  confirmOptimisticUser(client, "session", key, 7, "hello");
  const data = transcript(client);
  expect(data.queue).toMatchObject([{ content: "hello", id: 7, status: "pending" }]);
  expect(data.view).toMatchObject([{ content: "hello", key: "queue-7" }]);
});
test("confirmation removes optimistic duplicate after SSE persisted the user", () => {
  const client = new QueryClient();
  client.setQueryData<TranscriptData>(transcriptKey("session"), empty());
  const key = addOptimisticUser(client, "session", "hello");
  client.setQueryData<TranscriptData>(transcriptKey("session"), (current) =>
    rebuildTranscript(current ?? empty(), {
      messages: [
        {
          content: "hello",
          createdAt: 1,
          id: 11,
          images: [],
          queueId: 7,
          reasoning: "",
          role: "user",
          sourceId: "human-11",
          toolCalls: [],
        },
      ],
      queue: [
        {
          content: "",
          error: null,
          id: 7,
          status: "running",
          userMessageId: 11,
        },
      ],
    }),
  );
  confirmOptimisticUser(client, "session", key, 7, "hello");
  expect(transcript(client).view.map(({ key: itemKey }) => itemKey)).toEqual(["message-11"]);
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
    content: "hello",
    role: "user",
  });
});
function transcript(client: QueryClient) {
  const data = client.getQueryData<TranscriptData>(transcriptKey("session"));
  if (!data) {
    throw new Error("transcript cache missing");
  }
  return data;
}
function empty(): TranscriptData {
  return emptyTranscriptData();
}
