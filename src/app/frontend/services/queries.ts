import {
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import type { Control } from "../../../types";
import type { DisplayQueue, TimelineMessage } from "../../timeline";
import {
  bootstrap,
  appEvents,
  loadTranscript,
  sessionEvents,
  type SessionInfo,
} from "./client";
import { reportPausedRunErrors } from "./runErrors";

export interface BootstrapData {
  cwd: string;
  sessions: SessionInfo[];
}

export interface TranscriptData {
  control: Control;
  queue: DisplayQueue[];
  view: TimelineMessage[];
}

export const bootstrapKey = ["bootstrap"] as const;
export const transcriptKey = (sessionId: string) =>
  ["transcript", sessionId] as const;

const emptyTranscript: TranscriptData = {
  control: "running",
  queue: [],
  view: [],
};

export function useBootstrap() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: bootstrapKey,
    queryFn: ({ signal }) => bootstrap(signal),
  });
  useEffect(() => {
    const events = appEvents();
    const refresh = () => {
      void queryClient.invalidateQueries({ queryKey: bootstrapKey });
    };
    events.addEventListener("changed", refresh);
    return () => {
      events.close();
    };
  }, [queryClient]);
  return query;
}

export function useSessionTranscript(
  sessionId: string | undefined,
  pausedErrorMessage: string,
) {
  const queryClient = useQueryClient();
  const reportedErrors = useRef(new Set<string>());
  const query = useQuery({
    queryKey: transcriptKey(sessionId ?? ""),
    queryFn: ({ signal }) => loadTranscript(requiredId(sessionId), signal),
    enabled: sessionId !== undefined,
  });

  useEffect(() => {
    reportedErrors.current.clear();
    if (!sessionId) return;
    const events = sessionEvents(sessionId);
    const refresh = () => {
      void queryClient.invalidateQueries({
        queryKey: transcriptKey(sessionId),
      });
    };
    events.addEventListener("changed", refresh);
    return () => {
      events.close();
    };
  }, [queryClient, sessionId]);

  useEffect(() => {
    if (!sessionId || !query.data) return;
    reportPausedRunErrors(
      sessionId,
      query.data.queue,
      reportedErrors.current,
      pausedErrorMessage,
    );
  }, [pausedErrorMessage, query.data, sessionId]);

  return query.data ?? emptyTranscript;
}

export function addSession(queryClient: QueryClient, session: SessionInfo) {
  queryClient.setQueryData<BootstrapData>(bootstrapKey, (current) =>
    current
      ? { ...current, sessions: [session, ...current.sessions] }
      : current,
  );
}

export function removeSession(queryClient: QueryClient, sessionId: string) {
  queryClient.setQueryData<BootstrapData>(bootstrapKey, (current) =>
    current
      ? {
          ...current,
          sessions: current.sessions.filter(({ id }) => id !== sessionId),
        }
      : current,
  );
  queryClient.removeQueries({ queryKey: transcriptKey(sessionId) });
}

function requiredId(sessionId: string | undefined) {
  if (!sessionId) throw new Error("Transcript 查询缺少 sessionId");
  return sessionId;
}
