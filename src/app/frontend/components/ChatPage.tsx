import { GitFork } from "lucide-react";
import { useTranslation } from "react-i18next";
import { css, cx } from "styled-system/css";
import type { DisplayQueue, TimelineMessage } from "../../timeline";
import type { Control, SessionStatus } from "../../../types";
import { Composer } from "./Composer";
import { MarkdownView } from "./MarkdownView";
import { NewSessionPage } from "./NewSessionPage";
import { IconButton } from "./ParkUI";
import { ToolCall } from "./ToolCall";
import { TranscriptScroll } from "./TranscriptScroll";
import { reportPromiseErrors } from "../services/errors";

const page = css({
  display: "grid",
  gridTemplateRows: "minmax(0, 1fr) auto",
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

const messageRow = css({
  alignItems: "start",
  display: "flex",
  gap: "2",
  mb: "4",
  minW: 0,
  w: "full",
});

const userMessageRow = css({ justifyContent: "flex-end" });

const forkButton = css({
  alignSelf: "center",
  borderWidth: "0",
  flexShrink: 0,
});

export function ChatPage({
  activeId,
  control,
  newSession,
  pausing,
  queue,
  recentWorkspaces,
  sessionStatus,
  view,
  workspace,
  onSend,
  onControl,
  onFork,
  onPickWorkspace,
  onWorkspaceChange,
}: {
  activeId?: string;
  control: Control;
  newSession: boolean;
  pausing: boolean;
  queue: DisplayQueue[];
  recentWorkspaces: string[];
  sessionStatus?: SessionStatus;
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
  const loopRunning = queue.some((item) => item.status === "running");
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
        <div className={empty}>{t("empty")}</div>
      </div>
    );
  }
  return (
    <div className={page}>
      <TranscriptScroll activeId={activeId} queue={queue} view={view}>
        {view.length === 0 ? (
          <div className={empty}>{t("noMessages")}</div>
        ) : null}
        {view.map((item) => {
          const canFork =
            item.role === "user" &&
            item.id > 0 &&
            item.id !== firstUserMessageId;
          return (
            <div
              className={cx(messageRow, item.role === "user" && userMessageRow)}
              key={item.key}
            >
              {canFork ? (
                <IconButton
                  aria-label={t("fork")}
                  className={forkButton}
                  disabled={loopRunning}
                  onClick={() => {
                    reportPromiseErrors(onFork(item.id));
                  }}
                  title={t("fork")}
                  type="button"
                  variant="ghost"
                >
                  <GitFork size={14} />
                </IconButton>
              ) : null}
              <article
                className={cx(messageRoot, item.role === "user" && userMessage)}
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
              </article>
            </div>
          );
        })}
      </TranscriptScroll>
      <Composer
        controlDisabled={
          waitingForPause || (!paused && sessionStatus === "idle")
        }
        controlState={waitingForPause ? "pausing" : paused ? "resume" : "pause"}
        disabled={!activeId}
        draft={forkDraft}
        key={forkDraft === undefined ? activeId : `draft:${forkDraft}`}
        onControl={() => onControl(paused ? "running" : "pause")}
        onSend={onSend}
      />
    </div>
  );
}
