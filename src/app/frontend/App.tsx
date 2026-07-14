import { type ComponentProps, useCallback, useMemo, useState } from "react";
import {
  type Page,
  readPage,
  resolvePage,
  sessionPage,
  usePageNavigation,
  writePage,
} from "./route";
import {
  type SessionInfo,
  cancelTool,
  createSession,
  deleteSession,
  forkSession,
  pickWorkspace,
  sendMessage,
  setControl,
} from "./services/client";
import {
  addOptimisticUser,
  confirmOptimisticUser,
  removeOptimisticUser,
} from "./services/transcript/optimistic";
import { addSession, removeSession, useBootstrap, useSessionTranscript } from "./services/queries";
import { layout, main, sidebar } from "./design";
import { ChatPage } from "./components/Chat/ChatPage";
import { Sidebar } from "./components/Sidebar";
import { cx } from "styled-system/css";
import { recentWorkspaces } from "./services/recentWorkspaces";
import { useQueryClient } from "@tanstack/react-query";
const emptySessions: SessionInfo[] = [];
type ChatPageProps = ComponentProps<typeof ChatPage>;
async function selectWorkspace() {
  const result = await pickWorkspace();
  return result.workspace;
}
export function App() {
  const queryClient = useQueryClient();
  const bootstrap = useBootstrap();
  const [page, setPage] = useState(readPage);
  const [newWorkspace, setNewWorkspace] = useState<string>();
  const [pausingSessionId, setPausingSessionId] = useState<string>();
  const sessions = bootstrap.data?.sessions ?? emptySessions;
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
  const queueRunning = transcript.queue.some((item) => item.status === "running");
  const pausing =
    pausingSessionId === activeSession?.id && transcript.control === "running" && queueRunning;
  const workspaces = useMemo(() => recentWorkspaces(sessions), [sessions]);
  const openNewSession = useCallback(() => {
    setNewWorkspace(undefined);
    navigate({ kind: "new" });
  }, [navigate]);
  const selectSession = useCallback(
    (id: string) => {
      navigate(sessionPage(id));
    },
    [navigate],
  );
  const createNewSession = useCallback<ChatPageProps["onCreate"]>(
    async (initialState, attachments) => {
      const { session } = await createSession(newWorkspace ?? cwd, initialState, attachments);
      addSession(queryClient, session);
      navigate(sessionPage(session.id));
    },
    [cwd, navigate, newWorkspace, queryClient],
  );
  const cancelSessionTool = useCallback<ChatPageProps["onCancelTool"]>(
    async (toolCallId) => {
      if (activeSession) {
        await cancelTool(activeSession.id, toolCallId);
      }
    },
    [activeSession],
  );
  const changeControl = useCallback<ChatPageProps["onControl"]>(
    async (control) => {
      if (!activeSession) {
        return;
      }
      if (control === "pause" && queueRunning) {
        setPausingSessionId(activeSession.id);
      }
      try {
        await setControl(activeSession.id, control);
      } catch (error) {
        if (control === "pause") {
          setPausingSessionId(undefined);
        }
        throw error;
      }
      if (control !== "pause") {
        setPausingSessionId(undefined);
      }
    },
    [activeSession, queueRunning],
  );
  const deleteActiveSession = useCallback(async () => {
    if (!activeSession) {
      return;
    }
    await deleteSession(activeSession.id);
    removeSession(queryClient, activeSession.id);
    navigate({ kind: "new" });
  }, [activeSession, navigate, queryClient]);
  const forkActiveSession = useCallback<ChatPageProps["onFork"]>(
    async (messageId) => {
      if (!activeSession) {
        return;
      }
      const { session } = await forkSession(activeSession.id, messageId);
      addSession(queryClient, session);
      setPausingSessionId(undefined);
      navigate(sessionPage(session.id));
    },
    [activeSession, navigate, queryClient],
  );
  const sendSessionMessage = useCallback<ChatPageProps["onSend"]>(
    async (content, draftRevision, attachments) => {
      if (!activeSession) {
        return;
      }
      const optimisticKey = addOptimisticUser(queryClient, activeSession.id, content);
      try {
        const { content: sentContent, queueId } = await sendMessage(
          activeSession.id,
          content,
          draftRevision,
          attachments,
        );
        confirmOptimisticUser(queryClient, activeSession.id, optimisticKey, queueId, sentContent);
      } catch (error) {
        removeOptimisticUser(queryClient, activeSession.id, optimisticKey);
        throw error;
      }
    },
    [activeSession, queryClient],
  );
  return (
    <div className={cx("dark", layout)}>
      <aside className={sidebar}>
        <Sidebar
          activeId={activeSession?.id}
          showCreate={currentPage.kind !== "new"}
          sessions={sessions}
          onCreate={openNewSession}
          onSelect={selectSession}
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
          recentWorkspaces={workspaces}
          sessionStatus={activeSession?.status}
          view={transcript.view}
          workspace={newWorkspace ?? cwd}
          onCreate={createNewSession}
          onCancelTool={cancelSessionTool}
          onControl={changeControl}
          onDelete={deleteActiveSession}
          onFork={forkActiveSession}
          onPickWorkspace={selectWorkspace}
          onSend={sendSessionMessage}
          onWorkspaceChange={setNewWorkspace}
        />
      </main>
    </div>
  );
}
