import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { cx } from "styled-system/css";
import { ChatPage } from "./components/ChatPage";
import { Sidebar } from "./components/Sidebar";
import { layout, main, sidebar } from "./design";
import { readPage, writePage, type Page } from "./route";
import {
  bootstrap,
  createSession,
  deleteSession,
  forkSession,
  loadTranscript,
  pickWorkspace,
  sendMessage,
  sessionEvents,
  setControl,
  type SessionInfo,
} from "./services/client";
import { reportPausedRunErrors } from "./services/runErrors";

type Transcript = Awaited<ReturnType<typeof loadTranscript>>;

const emptyTranscript: Transcript = { control: "running", queue: [], view: [] };

export function App() {
  const { t } = useTranslation();
  const [cwd, setCwd] = useState("");
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [page, setPage] = useState(readPage);
  const [newWorkspace, setNewWorkspace] = useState("");
  const [transcript, setTranscript] = useState<Transcript>(emptyTranscript);
  const [pausingSessionId, setPausingSessionId] = useState<string>();
  const activeSession =
    page.kind === "session"
      ? sessions.find((session) => session.id === page.id)
      : undefined;
  const forkDraft = transcript.queue.find((item) => item.status === "draft");

  const navigate = (nextPage: Page, replace = false) => {
    writePage(nextPage, replace);
    setPage(nextPage);
  };

  useEffect(() => {
    const syncPage = () => setPage(readPage());
    window.addEventListener("popstate", syncPage);
    return () => window.removeEventListener("popstate", syncPage);
  }, []);

  useEffect(() => {
    void bootstrap().then((data) => {
      setCwd(data.cwd);
      setNewWorkspace(data.cwd);
      setSessions(data.sessions);
      const currentPage = readPage();
      const firstSession = data.sessions[0];
      const routeSessionExists =
        currentPage.kind === "session" &&
        data.sessions.some((session) => session.id === currentPage.id);
      if (currentPage.kind === "empty") {
        navigate(
          firstSession ? sessionPage(firstSession.id) : { kind: "new" },
          true,
        );
      } else if (currentPage.kind === "session" && !routeSessionExists) {
        navigate(
          firstSession ? sessionPage(firstSession.id) : { kind: "new" },
          true,
        );
      }
    });
  }, []);

  useEffect(() => {
    if (!activeSession) {
      setTranscript(emptyTranscript);
      return;
    }
    let stopped = false;
    const reportedErrors = new Set<string>();
    const refresh = async () => {
      const data = await loadTranscript(activeSession.id);
      if (stopped) return;
      setTranscript(data);
      reportPausedRunErrors(
        activeSession.id,
        data.queue,
        reportedErrors,
        t("runPausedError"),
      );
    };
    void refresh();
    const events = sessionEvents(activeSession.id);
    events.addEventListener("changed", () => void refresh());
    return () => {
      stopped = true;
      events.close();
    };
  }, [activeSession, t]);

  useEffect(() => {
    if (pausingSessionId !== activeSession?.id) return;
    const running = transcript.queue.some((item) => item.status === "running");
    if (transcript.control !== "running" || !running) {
      setPausingSessionId(undefined);
    }
  }, [activeSession?.id, pausingSessionId, transcript]);

  return (
    <div className={cx("dark", layout)}>
      <aside className={sidebar}>
        <Sidebar
          activeId={activeSession?.id}
          sessions={sessions}
          onCreate={async () => {
            setNewWorkspace(cwd);
            setTranscript(emptyTranscript);
            navigate({ kind: "new" });
          }}
          onDelete={async (id) => {
            await deleteSession(id);
            const next = sessions.filter((session) => session.id !== id);
            setSessions(next);
            if (activeSession?.id === id) {
              const firstSession = next[0];
              navigate(
                firstSession ? sessionPage(firstSession.id) : { kind: "new" },
              );
            }
          }}
          onSelect={(id) => navigate(sessionPage(id))}
        />
      </aside>
      <main className={main}>
        <ChatPage
          activeId={activeSession?.id}
          canControl={activeSession !== undefined}
          newSession={page.kind === "new"}
          pausing={pausingSessionId === activeSession?.id}
          control={transcript.control}
          queue={transcript.queue}
          view={transcript.view}
          workspace={newWorkspace}
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
            setPausingSessionId(undefined);
            setSessions((current) => [session, ...current]);
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
            if (page.kind === "new") {
              const { session } = await createSession(newWorkspace);
              setSessions((current) => [session, ...current]);
              navigate(sessionPage(session.id));
              await sendMessage(session.id, content);
              return;
            }
            if (!activeSession) return;
            await sendMessage(activeSession.id, content);
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
