import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";
import { cx } from "styled-system/css";
import { ChatPage } from "./components/Chat/ChatPage";
import { Sidebar } from "./components/Sidebar";
import { layout, main, sidebar } from "./design";
import { readPage, writePage, type Page } from "./route";
import {
  createSession,
  deleteSession,
  forkSession,
  pickWorkspace,
  sendMessage,
  setControl,
} from "./services/client";
import {
  addSession,
  removeSession,
  transcriptKey,
  useBootstrap,
  useSessionTranscript,
} from "./services/queries";
import { recentWorkspaces } from "./services/recentWorkspaces";
import type { InitialSessionState } from "../initialState";

export function App() {
  const queryClient = useQueryClient();
  const bootstrap = useBootstrap();
  const [page, setPage] = useState(readPage);
  const [newWorkspace, setNewWorkspace] = useState<string>();
  const [pausingSessionId, setPausingSessionId] = useState<string>();
  const sessions = bootstrap.data?.sessions ?? [];
  const cwd = bootstrap.data?.cwd ?? "";
  const currentPage = resolvePage(page, sessions, bootstrap.data !== undefined);
  const activeSession =
    currentPage.kind === "session"
      ? sessions.find((session) => session.id === currentPage.id)
      : undefined;
  const transcript = useSessionTranscript(activeSession?.id);
  const forkDraft = transcript.queue.find((item) => item.status === "draft");

  const navigate = useCallback((nextPage: Page, replace = false) => {
    writePage(nextPage, replace);
    setPage(nextPage);
  }, []);

  useEffect(() => {
    const syncPage = () => {
      setPage(readPage());
    };
    window.addEventListener("popstate", syncPage);
    return () => {
      window.removeEventListener("popstate", syncPage);
    };
  }, []);

  useEffect(() => {
    if (samePage(page, currentPage)) return;
    writePage(currentPage, true);
  }, [currentPage, page]);

  const pausing =
    pausingSessionId === activeSession?.id &&
    transcript.control === "running" &&
    transcript.queue.some((item) => item.status === "running");

  return (
    <div className={cx("dark", layout)}>
      <aside className={sidebar}>
        <Sidebar
          activeId={activeSession?.id}
          showCreate={currentPage.kind !== "new"}
          sessions={sessions}
          onCreate={() => {
            setNewWorkspace(undefined);
            navigate({ kind: "new" });
          }}
          onSelect={(id) => {
            navigate(sessionPage(id));
          }}
        />
      </aside>
      <main className={main}>
        <ChatPage
          activeId={activeSession?.id}
          newSession={currentPage.kind === "new"}
          pausing={pausing}
          control={transcript.control}
          queue={transcript.queue}
          recentWorkspaces={recentWorkspaces(sessions)}
          sessionStatus={activeSession?.status}
          view={transcript.view}
          workspace={newWorkspace ?? cwd}
          onCreate={async (initialState: InitialSessionState) => {
            const { session } = await createSession(
              newWorkspace ?? cwd,
              initialState,
            );
            addSession(queryClient, session);
            navigate(sessionPage(session.id));
          }}
          onControl={async (control) => {
            if (!activeSession) return;
            const running = transcript.queue.some(
              (item) => item.status === "running",
            );
            if (control === "pause" && running) {
              setPausingSessionId(activeSession.id);
            }
            try {
              await setControl(activeSession.id, control);
            } catch (error) {
              if (control === "pause") setPausingSessionId(undefined);
              throw error;
            }
            if (control !== "pause") setPausingSessionId(undefined);
          }}
          onDelete={async () => {
            if (!activeSession) return;
            await deleteSession(activeSession.id);
            removeSession(queryClient, activeSession.id);
            navigate({ kind: "new" });
          }}
          onFork={async (messageId) => {
            if (!activeSession) return;
            const { session } = await forkSession(activeSession.id, messageId);
            addSession(queryClient, session);
            setPausingSessionId(undefined);
            navigate(sessionPage(session.id));
          }}
          onPickWorkspace={async () => {
            const result = await pickWorkspace();
            return result.workspace;
          }}
          onSend={async (content, draftRevision) => {
            if (forkDraft && activeSession) {
              await sendMessage(activeSession.id, content, draftRevision);
              return;
            }
            if (!activeSession) return;
            await sendMessage(activeSession.id, content, draftRevision);
            await queryClient.invalidateQueries({
              queryKey: transcriptKey(activeSession.id),
            });
          }}
          onWorkspaceChange={setNewWorkspace}
        />
      </main>
    </div>
  );
}

function sessionPage(id: string): Page {
  return { kind: "session", id };
}

function resolvePage(page: Page, sessions: { id: string }[], ready: boolean) {
  if (!ready) return page;
  if (page.kind === "new") return page;
  return sessions.some((session) => session.id === page.id)
    ? page
    : ({ kind: "new" } as const);
}

function samePage(left: Page, right: Page) {
  if (left.kind !== right.kind) return false;
  return left.kind !== "session" || right.kind !== "session"
    ? true
    : left.id === right.id;
}
