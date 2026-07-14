import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import type { DisplayEvent } from "../../../timeline";
import { loadTranscript, sessionEvents } from "../client";
import { readTranscriptEvent } from "../events/data";
import { reportError } from "../errors";
import { RefreshScheduler } from "../scheduling/refreshScheduler";
import {
  appendTranscriptEvents,
  emptyTranscriptData,
  reconcileTranscript,
  type TranscriptData,
} from "./cache";
export type { TranscriptData } from "./cache";
export const transcriptKey = (sessionId: string) => ["transcript", sessionId] as const;
const emptyTranscript = emptyTranscriptData();
export function useSessionTranscript(
  sessionId: string | undefined,
  refreshIntervalMs: number | undefined,
) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: transcriptKey(sessionId ?? ""),
    queryFn: async ({ signal }) => {
      const id = requiredId(sessionId);
      const snapshot = await loadTranscript(id, signal);
      return reconcileTranscript(
        snapshot,
        queryClient.getQueryData<TranscriptData>(transcriptKey(id)),
      );
    },
    enabled: sessionId !== undefined,
  });
  useEffect(() => {
    if (!sessionId || refreshIntervalMs === undefined) return;
    const events = sessionEvents(sessionId);
    const refreshScheduler = new RefreshScheduler(
      refreshIntervalMs,
      () => refreshTranscript(queryClient, sessionId),
      reportError,
    );
    const pendingEvents: DisplayEvent[] = [];
    const deltaScheduler = new RefreshScheduler(
      refreshIntervalMs,
      () => {
        const batch = pendingEvents.splice(0);
        queryClient.setQueryData<TranscriptData>(transcriptKey(sessionId), (current) =>
          appendTranscriptEvents(current ?? emptyTranscriptData(), batch),
        );
        return Promise.resolve();
      },
      reportError,
    );
    const delta = (event: Event) => {
      try {
        pendingEvents.push(readTranscriptEvent(event));
        deltaScheduler.request();
      } catch (error) {
        reportError(error);
      }
    };
    events.addEventListener("changed", () => {
      refreshScheduler.request();
    });
    events.addEventListener("delta", delta);
    return () => {
      refreshScheduler.dispose();
      deltaScheduler.dispose();
      events.close();
    };
  }, [queryClient, refreshIntervalMs, sessionId]);
  return query.data ?? emptyTranscript;
}
async function refreshTranscript(
  queryClient: ReturnType<typeof useQueryClient>,
  sessionId: string,
) {
  const queryKey = transcriptKey(sessionId);
  const wasFetching = queryClient.getQueryState(queryKey)?.fetchStatus === "fetching";
  await queryClient.invalidateQueries({ queryKey }, { cancelRefetch: false });
  if (wasFetching) {
    await queryClient.invalidateQueries({ queryKey }, { cancelRefetch: false });
  }
}
function requiredId(sessionId: string | undefined) {
  if (!sessionId) throw new Error("Transcript 查询缺少 sessionId");
  return sessionId;
}
