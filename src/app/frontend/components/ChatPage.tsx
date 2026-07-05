import { Pause, Play, Square } from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { css } from "styled-system/css";
import type { Message, QueueItem, StreamEvent } from "../services/client";
import { button, message, scroll } from "../design";
import { Composer } from "./Composer";
import { MarkdownView } from "./MarkdownView";
import { ToolCall } from "./ToolCall";

const header = css({
  borderBottomWidth: "1px",
  borderBottomColor: "line",
  display: "flex",
  gap: "2",
  justifyContent: "flex-end",
  p: "4",
});

const empty = css({
  color: "muted",
  display: "grid",
  h: "full",
  placeItems: "center",
});

const label = css({
  color: "muted",
  fontSize: "xs",
});

export function ChatPage({
  activeId,
  messages,
  queue,
  events,
  onSend,
  onControl,
}: {
  activeId?: string;
  messages: Message[];
  queue: QueueItem[];
  events: StreamEvent[];
  onSend(content: string): Promise<void>;
  onControl(control: string): Promise<void>;
}) {
  const { t } = useTranslation();
  const view = useMemo(
    () => buildView(messages, queue, events),
    [messages, queue, events],
  );
  if (!activeId) return <div className={empty}>{t("empty")}</div>;
  return (
    <>
      <header className={header}>
        <button className={button()} onClick={() => void onControl("pause")}>
          <Pause size={14} /> {t("pause")}
        </button>
        <button className={button()} onClick={() => void onControl("running")}>
          <Play size={14} /> {t("resume")}
        </button>
        <button className={button()} onClick={() => void onControl("cancel")}>
          <Square size={14} /> {t("cancel")}
        </button>
      </header>
      <section className={scroll}>
        {view.length === 0 ? (
          <div className={empty}>{t("noMessages")}</div>
        ) : null}
        {view.map((item) => (
          <article className={message({ role: item.role })} key={item.key}>
            <div className={label}>{t(item.role)}</div>
            <MarkdownView content={item.content} />
            {item.toolCalls.map((call) => (
              <ToolCall
                call={call}
                key={call.id}
                output={item.outputs.get(call.id)}
              />
            ))}
          </article>
        ))}
      </section>
      <Composer disabled={!activeId} onSend={onSend} />
    </>
  );
}

type ViewMessage = Message & {
  key: string;
  outputs: Map<string, Message>;
};

function buildView(
  messages: Message[],
  queue: QueueItem[],
  events: StreamEvent[],
): ViewMessage[] {
  const outputs = new Map(
    messages
      .filter((item) => item.role === "tool" && item.toolCallId)
      .map((item) => [item.toolCallId!, item]),
  );
  const visible = messages
    .filter((item) => item.role !== "tool")
    .map((item) => ({ ...item, key: `message-${item.id}`, outputs }));
  const knownQueue = new Set(messages.map((item) => item.queueId));
  const syntheticUsers = queue
    .filter((item) => item.status === "pending" && !knownQueue.has(item.id))
    .map((item) =>
      synthetic("user", item.content, `queue-${item.id}`, outputs),
    );
  const streaming = queue
    .filter((item) => item.status === "running" || item.status === "paused")
    .map((item) => streamMessage(item, events, outputs))
    .filter((item) => item.content.length > 0);
  return [...visible, ...syntheticUsers, ...streaming];
}

function streamMessage(
  item: QueueItem,
  events: StreamEvent[],
  outputs: Map<string, Message>,
): ViewMessage {
  const content = events
    .map((event) => eventText(event, item.id))
    .filter((text) => text.length > 0)
    .join("");
  return synthetic("assistant", content, `stream-${item.id}`, outputs);
}

function synthetic(
  role: Message["role"],
  content: string,
  key: string,
  outputs: Map<string, Message>,
): ViewMessage {
  return {
    id: -1,
    role,
    content,
    queueId: null,
    toolCalls: [],
    createdAt: 0,
    key,
    outputs,
  };
}

function eventText(event: StreamEvent, queueId: number) {
  if (!isRecord(event.payload) || event.payload["queueId"] !== queueId)
    return "";
  return typeof event.payload["text"] === "string" ? event.payload["text"] : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
