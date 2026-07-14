import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import type { AttachmentSettings } from "../../attachments/contract";
import { bootstrap, appEvents, type FrontendSettings, type SessionInfo } from "./client";
import { readDeletedEvent, readSessionEvent, readSessionsEvent } from "./events/data";
import { reportError } from "./errors";
import { reportSessionErrors } from "./events/reporting";
import { transcriptKey } from "./transcript/query";
export interface BootstrapData {
  attachments: AttachmentSettings;
  cwd: string;
  frontend: FrontendSettings;
  sessions: SessionInfo[];
}
export { transcriptKey, useSessionTranscript, type TranscriptData } from "./transcript/query";
export const bootstrapKey = ["bootstrap"] as const;
export function useBootstrap() {
  const queryClient = useQueryClient();
  const reportedErrors = useRef(new Set<string>());
  const streamedSessions = useRef<SessionInfo[] | undefined>(undefined);
  const query = useQuery({
    queryKey: bootstrapKey,
    queryFn: async ({ signal }) => {
      const data = await bootstrap(signal);
      return streamedSessions.current ? { ...data, sessions: streamedSessions.current } : data;
    },
  });
  useEffect(() => {
    const events = appEvents();
    const replace = (event: Event) => {
      try {
        const sessions = readSessionsEvent(event);
        streamedSessions.current = sessions;
        if (!replaceCachedSessions(queryClient, sessions)) {
          streamedSessions.current = sessions;
        }
      } catch (error) {
        reportError(error);
      }
    };
    const upsert = (event: Event) => {
      try {
        const session = readSessionEvent(event);
        if (streamedSessions.current) {
          streamedSessions.current = upsertSessionList(streamedSessions.current, session);
        }
        updateCachedSessions(queryClient, (sessions) => upsertSessionList(sessions, session));
      } catch (error) {
        reportError(error);
      }
    };
    const remove = (event: Event) => {
      try {
        const sessionId = readDeletedEvent(event);
        if (streamedSessions.current) {
          streamedSessions.current = withoutSession(streamedSessions.current, sessionId);
        }
        updateCachedSessions(queryClient, (sessions) => withoutSession(sessions, sessionId));
        queryClient.removeQueries({ queryKey: transcriptKey(sessionId) });
      } catch (error) {
        reportError(error);
      }
    };
    events.addEventListener("sessions", replace);
    events.addEventListener("session", upsert);
    events.addEventListener("deleted", remove);
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
export function addSession(queryClient: QueryClient, session: SessionInfo) {
  queryClient.setQueryData<BootstrapData>(bootstrapKey, (current) =>
    current ? { ...current, sessions: upsertSessionList(current.sessions, session) } : current,
  );
}
export function removeSession(queryClient: QueryClient, sessionId: string) {
  queryClient.setQueryData<BootstrapData>(bootstrapKey, (current) =>
    current
      ? {
          ...current,
          sessions: withoutSession(current.sessions, sessionId),
        }
      : current,
  );
  queryClient.removeQueries({ queryKey: transcriptKey(sessionId) });
}
function replaceCachedSessions(queryClient: QueryClient, sessions: SessionInfo[]) {
  let replaced = false;
  queryClient.setQueryData<BootstrapData>(bootstrapKey, (current) => {
    if (!current) return current;
    replaced = true;
    return { ...current, sessions };
  });
  return replaced;
}
function updateCachedSessions(
  queryClient: QueryClient,
  update: (sessions: SessionInfo[]) => SessionInfo[],
) {
  queryClient.setQueryData<BootstrapData>(bootstrapKey, (current) =>
    current ? { ...current, sessions: update(current.sessions) } : current,
  );
}
export function upsertSessionList(sessions: SessionInfo[], session: SessionInfo) {
  return [session, ...sessions.filter(({ id }) => id !== session.id)].sort(
    (left, right) => right.updatedAt - left.updatedAt || right.createdAt - left.createdAt,
  );
}
export function withoutSession(sessions: SessionInfo[], sessionId: string) {
  return sessions.filter(({ id }) => id !== sessionId);
}
