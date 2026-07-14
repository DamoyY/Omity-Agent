import { type TranscriptData, transcriptKey } from "../queries";
import { emptyTranscriptData, rebuildTranscript, withoutOptimistic } from "./cache";
import type { QueryClient } from "@tanstack/react-query";

export function addOptimisticUser(queryClient: QueryClient, sessionId: string, content: string) {
  const key = `optimistic-${crypto.randomUUID()}`;
  queryClient.setQueryData<TranscriptData>(transcriptKey(sessionId), (current) => {
    const transcript = current ?? emptyTranscriptData();
    return {
      ...transcript,
      view: [
        ...transcript.view,
        {
          content,
          createdAt: Date.now(),
          id: -1,
          key,
          parts: [{ content, type: "content" }],
          role: "user",
        },
      ],
    };
  });
  return key;
}
export function confirmOptimisticUser(
  queryClient: QueryClient,
  sessionId: string,
  key: string,
  queueId: number,
  content: string,
) {
  queryClient.setQueryData<TranscriptData>(transcriptKey(sessionId), (current) => {
    if (!current) {
      return current;
    }
    const queueItem = current.queue.find(({ id }) => id === queueId);
    const queue = queueItem
      ? current.queue
      : [
          ...current.queue,
          {
            content,
            error: null,
            id: queueId,
            status: "pending",
            userMessageId: null,
          },
        ];
    return rebuildTranscript(withoutOptimistic(current, key), { queue });
  });
}
export function removeOptimisticUser(queryClient: QueryClient, sessionId: string, key: string) {
  queryClient.setQueryData<TranscriptData>(transcriptKey(sessionId), (current) =>
    current ? withoutOptimistic(current, key) : current,
  );
}
