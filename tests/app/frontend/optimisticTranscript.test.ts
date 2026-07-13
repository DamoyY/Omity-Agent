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
  client.setQueryData<TranscriptData>(transcriptKey("session"), (current) => ({
    ...(current ?? empty()),
    queue: [
      {
        id: 7,
        content: "",
        status: "running",
        error: null,
        userMessageId: 11,
      },
    ],
    view: [
      ...(current?.view ?? []),
      {
        id: 11,
        key: "message-11",
        role: "user",
        content: "hello",
        createdAt: 1,
        parts: [{ type: "content", content: "hello" }],
      },
    ],
  }));

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

function transcript(client: QueryClient) {
  const data = client.getQueryData<TranscriptData>(transcriptKey("session"));
  if (!data) throw new Error("transcript cache missing");
  return data;
}

function empty(): TranscriptData {
  return { control: "running", queue: [], view: [] };
}
