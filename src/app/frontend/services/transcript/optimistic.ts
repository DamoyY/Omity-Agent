import type { QueryClient } from "@tanstack/react-query";
import { transcriptKey, type TranscriptData } from "../queries";

export function addOptimisticUser(
  queryClient: QueryClient,
  sessionId: string,
  content: string,
) {
  const key = `optimistic-${crypto.randomUUID()}`;
  queryClient.setQueryData<TranscriptData>(
    transcriptKey(sessionId),
    (current) => {
      const transcript = current ?? {
        control: "running",
        queue: [],
        view: [],
      };
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
  const pendingKey = `queue-${queueId.toString()}`;
  queryClient.setQueryData<TranscriptData>(
    transcriptKey(sessionId),
    (current) => {
      if (!current) return current;
      const queueItem = current.queue.find(({ id }) => id === queueId);
      const userPersisted = queueItem?.userMessageId != null;
      const pendingVisible = current.view.some(({ key: itemKey }) => {
        return itemKey === pendingKey;
      });
      return {
        ...current,
        queue: queueItem
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
            ],
        view: current.view.flatMap((item) => {
          if (item.key !== key) return [item];
          return userPersisted || pendingVisible
            ? []
            : [{ ...item, key: pendingKey }];
        }),
      };
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
    (current) =>
      current
        ? {
            ...current,
            view: current.view.filter((item) => item.key !== key),
          }
        : current,
  );
}
