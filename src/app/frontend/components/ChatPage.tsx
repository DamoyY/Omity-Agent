import { GitFork, Pause, Play } from "lucide-react";
import { useTranslation } from "react-i18next";
import { css, cx } from "styled-system/css";
import type { DisplayQueue, TimelineMessage } from "../../timeline";
import type { Control } from "../../../types";
import { Composer } from "./Composer";
import { MarkdownView } from "./MarkdownView";
import { NewSessionPage } from "./NewSessionPage";
import { Button } from "./ParkUI";
import { ToolCall } from "./ToolCall";
import { TranscriptScroll } from "./TranscriptScroll";

const header = css({
  bg: "surface",
  borderBottomWidth: "1px",
  borderBottomColor: "line",
  display: "flex",
  gap: "2",
  justifyContent: "flex-end",
  p: "3",
});

const page = css({
  display: "grid",
  gridTemplateRows: "auto minmax(0, 1fr) auto",
  h: "full",
  minH: 0,
  minW: 0,
  overflow: "hidden",
});

const empty = css({
  color: "muted",
  display: "grid",
  h: "full",
  placeItems: "center",
});

const messageRoot = css({
  bg: "surface",
  borderWidth: "1px",
  borderColor: "line",
  display: "grid",
  gap: "3",
  justifyItems: "start",
  maxW: "52rem",
  mb: "4",
  minW: 0,
  p: "4",
  w: "fit-content",
});

const userMessage = css({
  bg: "surfaceRaised",
  borderColor: "lineStrong",
  ml: "auto",
  textAlign: "left",
});

const roleLabel = css({
  color: "muted",
  fontSize: "xs",
});

const messageActions = css({
  display: "flex",
  justifyContent: "flex-end",
  w: "full",
});

export function ChatPage({
  activeId,
  canControl,
  control,
  newSession,
  pausing,
  queue,
  recentWorkspaces,
  view,
  workspace,
  onSend,
  onControl,
  onFork,
  onPickWorkspace,
  onWorkspaceChange,
}: {
  activeId?: string;
  canControl: boolean;
  control: Control;
  newSession: boolean;
  pausing: boolean;
  queue: DisplayQueue[];
  recentWorkspaces: string[];
  view: TimelineMessage[];
  workspace?: string;
  onSend: (content: string) => Promise<void>;
  onControl: (control: Extract<Control, "running" | "pause">) => Promise<void>;
  onFork: (messageId: number) => Promise<void>;
  onPickWorkspace: () => Promise<string | null>;
  onWorkspaceChange: (workspace: string) => void;
}) {
  const { t } = useTranslation();
  const paused = control === "pause" || control === "pause_cancel";
  const waitingForPause = pausing && !paused;
  const firstUserMessageId = view.find((item) => item.role === "user")?.id;
  const forkDraft = queue.find((item) => item.status === "draft")?.content;

  if (!activeId) {
    if (newSession) {
      return (
        <NewSessionPage
          pageClassName={page}
          recentWorkspaces={recentWorkspaces}
          workspace={workspace ?? ""}
          onPickWorkspace={onPickWorkspace}
          onSend={onSend}
          onWorkspaceChange={onWorkspaceChange}
        />
      );
    }
    return (
      <div className={page}>
        <div />
        <div className={empty}>{t("empty")}</div>
      </div>
    );
  }
  return (
    <div className={page}>
      {canControl ? (
        <header className={header}>
          <Button
            onClick={() => void onControl(paused ? "running" : "pause")}
            disabled={waitingForPause}
            variant="outline"
          >
            {paused ? <Play size={14} /> : <Pause size={14} />}
            {waitingForPause ? t("pausing") : paused ? t("resume") : t("pause")}
          </Button>
        </header>
      ) : (
        <div />
      )}
      <TranscriptScroll activeId={activeId} queue={queue} view={view}>
        {view.length === 0 ? (
          <div className={empty}>{t("noMessages")}</div>
        ) : null}
        {view.map((item) => (
          <article
            className={cx(messageRoot, item.role === "user" && userMessage)}
            key={item.key}
          >
            <div className={roleLabel}>{t(item.role)}</div>
            {item.parts.map((part, index) =>
              part.type === "content" ? (
                <MarkdownView
                  content={part.content}
                  key={`content-${index.toString()}`}
                />
              ) : (
                <ToolCall
                  call={part.call}
                  key={part.call.id}
                  output={part.output}
                />
              ),
            )}
            {item.role === "user" &&
            item.id > 0 &&
            item.id !== firstUserMessageId ? (
              <div className={messageActions}>
                <Button onClick={() => void onFork(item.id)} type="button">
                  <GitFork size={14} />
                  {t("fork")}
                </Button>
              </div>
            ) : null}
          </article>
        ))}
      </TranscriptScroll>
      <Composer
        disabled={!activeId}
        draft={forkDraft}
        key={forkDraft === undefined ? activeId : `draft:${forkDraft}`}
        onSend={onSend}
      />
    </div>
  );
}
