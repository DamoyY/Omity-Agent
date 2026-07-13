import type { QueryClient } from "@tanstack/react-query";
import { transcriptKey, type TranscriptData } from "../queries";
import {
  emptyTranscriptData,
  rebuildTranscript,
  withoutOptimistic,
} from "./cache";

export function addOptimisticUser(
  queryClient: QueryClient,
  sessionId: string,
  content: string,
) {
  const key = `optimistic-${crypto.randomUUID()}`;
  queryClient.setQueryData<TranscriptData>(
    transcriptKey(sessionId),
    (current) => {
      const transcript = current ?? emptyTranscriptData();
      return {
        ...transcript,
        view: [
          ...transcript.view,
          {
            id: -1,
            key,
            role: "user",
            content,
            createdAt: Date.now(),
            parts: [{ type: "content", content }],
          },
        ],
      };
    },
  );
  return key;
}

export function confirmOptimisticUser(
  queryClient: QueryClient,
  sessionId: string,
  key: string,
  queueId: number,
  content: string,
) {
  queryClient.setQueryData<TranscriptData>(
    transcriptKey(sessionId),
    (current) => {
      if (!current) return current;
      const queueItem = current.queue.find(({ id }) => id === queueId);
      const queue = queueItem
        ? current.queue
        : [
            ...current.queue,
            {
              id: queueId,
              content,
              status: "pending",
              error: null,
              userMessageId: null,
            },
          ];
      return rebuildTranscript(withoutOptimistic(current, key), { queue });
    },
  );
}

export function removeOptimisticUser(
  queryClient: QueryClient,
  sessionId: string,
  key: string,
) {
  queryClient.setQueryData<TranscriptData>(
    transcriptKey(sessionId),
    (current) => (current ? withoutOptimistic(current, key) : current),
  );
}
