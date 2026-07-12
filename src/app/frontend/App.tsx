import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { cx } from "styled-system/css";
import { ChatPage } from "./components/ChatPage";
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

export function App() {
  const { t } = useTranslation();
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
  const transcript = useSessionTranscript(
    activeSession?.id,
    t("runPausedError"),
  );
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
          sessions={sessions}
          onCreate={() => {
            setNewWorkspace(undefined);
            navigate({ kind: "new" });
          }}
          onDelete={async (id) => {
            await deleteSession(id);
            removeSession(queryClient, id);
            if (activeSession?.id === id) {
              const next = sessions.find((session) => session.id !== id);
              navigate(next ? sessionPage(next.id) : { kind: "new" });
            }
          }}
          onSelect={(id) => {
            navigate(sessionPage(id));
          }}
        />
      </aside>
      <main className={main}>
        <ChatPage
          activeId={activeSession?.id}
          canControl={activeSession !== undefined}
          newSession={currentPage.kind === "new"}
          pausing={pausing}
          control={transcript.control}
          queue={transcript.queue}
          recentWorkspaces={recentWorkspaces(sessions)}
          view={transcript.view}
          workspace={newWorkspace ?? cwd}
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
          onSend={async (content) => {
            if (forkDraft && activeSession) {
              await sendMessage(activeSession.id, content);
              return;
            }
            if (currentPage.kind === "new") {
              const { session } = await createSession(newWorkspace ?? cwd);
              addSession(queryClient, session);
              navigate(sessionPage(session.id));
              await sendMessage(session.id, content);
              return;
            }
            if (!activeSession) return;
            await sendMessage(activeSession.id, content);
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
  if (
    page.kind === "session" &&
    sessions.some((session) => session.id === page.id)
  ) {
    return page;
  }
  if (page.kind === "new") return page;
  const first = sessions[0];
  return first ? sessionPage(first.id) : ({ kind: "new" } as const);
}

function samePage(left: Page, right: Page) {
  if (left.kind !== right.kind) return false;
  return left.kind !== "session" || right.kind !== "session"
    ? true
    : left.id === right.id;
}
