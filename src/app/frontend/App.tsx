import { useEffect, useState } from "react";
import {
  bootstrap,
  createSession,
  deleteSession,
  loadTranscript,
  pickWorkspace,
  sendMessage,
  setControl,
  type Message,
  type QueueItem,
  type SessionInfo,
  type StreamEvent,
} from "./services/client";
import { ChatPage } from "./components/ChatPage";
import { Sidebar } from "./components/Sidebar";
import { layout, main, sidebar } from "./design";

type Transcript = {
  messages: Message[];
  queue: QueueItem[];
  events: StreamEvent[];
};

type LocalSession = SessionInfo & {
  draft?: boolean;
};

const emptyTranscript: Transcript = { messages: [], queue: [], events: [] };

export function App() {
  const [cwd, setCwd] = useState("");
  const [sessions, setSessions] = useState<LocalSession[]>([]);
  const [activeId, setActiveId] = useState<string>();
  const [transcript, setTranscript] = useState<Transcript>(emptyTranscript);
  const activeSession = sessions.find((session) => session.id === activeId);

  useEffect(() => {
    void bootstrap().then((data) => {
      setCwd(data.cwd);
      setSessions(data.sessions);
      setActiveId(data.sessions[0]?.id);
    });
  }, []);

  useEffect(() => {
    if (!activeId || activeSession?.draft) {
      setTranscript(emptyTranscript);
      return;
    }
    let stopped = false;
    const refresh = async () => {
      const data = await loadTranscript(activeId);
      if (!stopped) setTranscript(data);
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 800);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [activeId, activeSession?.draft]);

  return (
    <div className={layout}>
      <aside className={sidebar}>
        <Sidebar
          activeId={activeId}
          cwd={cwd}
          sessions={sessions.filter((session) => !session.draft)}
          onCreate={async (workspace) => {
            const now = Math.floor(Date.now() / 1000);
            const session = {
              id: `draft-${crypto.randomUUID()}`,
              workspace,
              createdAt: now,
              updatedAt: now,
              running: false,
              draft: true,
            };
            setSessions((current) => [session, ...current]);
            setActiveId(session.id);
          }}
          onDelete={async (id) => {
            const target = sessions.find((session) => session.id === id);
            if (!target?.draft) await deleteSession(id);
            const next = sessions.filter((session) => session.id !== id);
            setSessions(next);
            if (activeId === id) {
              setActiveId(next[0]?.id);
              setTranscript(emptyTranscript);
            }
          }}
          onPickWorkspace={async () => {
            const result = await pickWorkspace();
            return result.workspace;
          }}
          onSelect={setActiveId}
        />
      </aside>
      <main className={main}>
        <ChatPage
          activeId={activeId}
          canControl={activeSession !== undefined && !activeSession.draft}
          events={transcript.events}
          messages={transcript.messages}
          queue={transcript.queue}
          onControl={async (control) => {
            if (!activeSession || activeSession.draft) return;
            await setControl(activeSession.id, control);
          }}
          onSend={async (content) => {
            if (!activeSession) return;
            if (activeSession.draft) {
              const { session } = await createSession(activeSession.workspace);
              setSessions((current) =>
                current.map((item) =>
                  item.id === activeSession.id ? session : item,
                ),
              );
              setActiveId(session.id);
              await sendMessage(session.id, content);
              return;
            }
            await sendMessage(activeSession.id, content);
          }}
        />
      </main>
    </div>
  );
}
