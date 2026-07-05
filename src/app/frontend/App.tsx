import { useEffect, useState } from "react";
import {
  bootstrap,
  createSession,
  loadTranscript,
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

const emptyTranscript: Transcript = { messages: [], queue: [], events: [] };

export function App() {
  const [cwd, setCwd] = useState("");
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [activeId, setActiveId] = useState<string>();
  const [transcript, setTranscript] = useState<Transcript>(emptyTranscript);

  useEffect(() => {
    void bootstrap().then((data) => {
      setCwd(data.cwd);
      setSessions(data.sessions);
      setActiveId(data.sessions[0]?.id);
    });
  }, []);

  useEffect(() => {
    if (!activeId) return;
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
  }, [activeId]);

  return (
    <div className={layout}>
      <aside className={sidebar}>
        <Sidebar
          activeId={activeId}
          cwd={cwd}
          sessions={sessions}
          onCreate={async (workspace) => {
            const { session } = await createSession(workspace);
            setSessions((current) => [session, ...current]);
            setActiveId(session.id);
          }}
          onSelect={setActiveId}
        />
      </aside>
      <main className={main}>
        <ChatPage
          activeId={activeId}
          events={transcript.events}
          messages={transcript.messages}
          queue={transcript.queue}
          onControl={async (control) => {
            if (!activeId) return;
            await setControl(activeId, control);
          }}
          onSend={async (content) => {
            if (!activeId) return;
            await sendMessage(activeId, content);
          }}
        />
      </main>
    </div>
  );
}
