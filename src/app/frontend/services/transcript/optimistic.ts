import { type TranscriptData, transcriptKey } from "../queries";
import { emptyTranscriptData, rebuildTranscript, withoutOptimistic } from "./cache";
import type { QueryClient } from "@tanstack/react-query";
import { claimShortId } from "../../../../infrastructure/randomId";

export function addOptimisticUser(queryClient: QueryClient, sessionId: string, content: string) {
  const keys = new Set(
    queryClient.getQueryData<TranscriptData>(transcriptKey(sessionId))?.view.map(({ key }) => key),
  );
  const key = claimShortId((candidate) => {
    if (keys.has(candidate)) {
      return false;
    }
    keys.add(candidate);
    return true;
  });
  queryClient.setQueryData<TranscriptData>(transcriptKey(sessionId), (current) => {
    const transcript = current ?? emptyTranscriptData();
    return {
      ...transcript,
      view: [
        ...transcript.view,
        {
          afterEventId: transcript.eventCursor,
          content,
          createdAt: Date.now(),
          id: -1,
          key,
          optimistic: true,
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
    const optimistic = current.view.find((item) => item.key === key);
    const queueItem = current.queue.find(({ id }) => id === queueId);
    const queue = queueItem
      ? current.queue
      : [
          ...current.queue,
          {
            ...(optimistic?.afterEventId === undefined
              ? {}
              : { afterEventId: optimistic.afterEventId }),
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
