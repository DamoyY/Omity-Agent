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
import { reportPromiseErrors } from "./errors";
import { reportSessionErrors } from "./sessionErrors";

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
  const reportedErrors = useRef(new Set<string>());
  const query = useQuery({
    queryKey: bootstrapKey,
    queryFn: ({ signal }) => bootstrap(signal),
  });
  useEffect(() => {
    const events = appEvents();
    const refresh = () => {
      reportPromiseErrors(
        queryClient.invalidateQueries({ queryKey: bootstrapKey }),
      );
    };
    events.addEventListener("changed", refresh);
    return () => {
      events.close();
    };
  }, [queryClient]);
  useEffect(() => {
    if (!query.data) return;
    reportSessionErrors(query.data.sessions, reportedErrors.current);
  }, [query.data]);
  return query;
}

export function useSessionTranscript(sessionId: string | undefined) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: transcriptKey(sessionId ?? ""),
    queryFn: ({ signal }) => loadTranscript(requiredId(sessionId), signal),
    enabled: sessionId !== undefined,
  });

  useEffect(() => {
    if (!sessionId) return;
    const events = sessionEvents(sessionId);
    const refresh = () => {
      reportPromiseErrors(
        queryClient.invalidateQueries({
          queryKey: transcriptKey(sessionId),
        }),
      );
    };
    events.addEventListener("changed", refresh);
    return () => {
      events.close();
    };
  }, [queryClient, sessionId]);

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
