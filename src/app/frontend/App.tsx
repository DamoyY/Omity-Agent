import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { cx } from "styled-system/css";
import { ChatPage } from "./components/Chat/ChatPage";
import { Sidebar } from "./components/Sidebar";
import { layout, main, sidebar } from "./design";
import {
  readPage,
  resolvePage,
  sessionPage,
  usePageNavigation,
  writePage,
  type Page,
} from "./route";
import {
  cancelTool,
  createSession,
  deleteSession,
  forkSession,
  pickWorkspace,
  sendMessage,
  setControl,
} from "./services/client";
import { addSession, removeSession, useBootstrap, useSessionTranscript } from "./services/queries";
import {
  addOptimisticUser,
  confirmOptimisticUser,
  removeOptimisticUser,
} from "./services/transcript/optimistic";
import { recentWorkspaces } from "./services/recentWorkspaces";
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
  const transcript = useSessionTranscript(
    activeSession?.id,
    bootstrap.data?.frontend.transcriptRefreshIntervalMs,
  );
  const navigate = useCallback((nextPage: Page, replace = false) => {
    writePage(nextPage, replace);
    setPage(nextPage);
  }, []);
  usePageNavigation(page, currentPage, setPage);
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
          attachmentSettings={bootstrap.data?.attachments}
          draftSaveDelayMs={bootstrap.data?.frontend.draftSaveDelayMs}
          newSession={currentPage.kind === "new"}
          pausing={pausing}
          control={transcript.control}
          queue={transcript.queue}
          recentWorkspaces={recentWorkspaces(sessions)}
          sessionStatus={activeSession?.status}
          view={transcript.view}
          workspace={newWorkspace ?? cwd}
          onCreate={async (initialState, attachments) => {
            const { session } = await createSession(newWorkspace ?? cwd, initialState, attachments);
            addSession(queryClient, session);
            navigate(sessionPage(session.id));
          }}
          onCancelTool={async (toolCallId) => {
            if (!activeSession) return;
            await cancelTool(activeSession.id, toolCallId);
          }}
          onControl={async (control) => {
            if (!activeSession) return;
            const running = transcript.queue.some((item) => item.status === "running");
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
          onSend={async (content, draftRevision, attachments) => {
            if (!activeSession) return;
            const optimisticKey = addOptimisticUser(queryClient, activeSession.id, content);
            try {
              const { content: sentContent, queueId } = await sendMessage(
                activeSession.id,
                content,
                draftRevision,
                attachments,
              );
              confirmOptimisticUser(
                queryClient,
                activeSession.id,
                optimisticKey,
                queueId,
                sentContent,
              );
            } catch (error) {
              removeOptimisticUser(queryClient, activeSession.id, optimisticKey);
              throw error;
            }
          }}
          onWorkspaceChange={setNewWorkspace}
        />
      </main>
    </div>
  );
}
