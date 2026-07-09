import { Pause, Play } from "lucide-react";
import { useTranslation } from "react-i18next";
import { css, cx } from "styled-system/css";
import type { DisplayQueue, TimelineMessage } from "../../timeline";
import { scroll } from "../design";
import { Composer } from "./Composer";
import { MarkdownView } from "./MarkdownView";
import { NewSessionPage } from "./NewSessionPage";
import { Button } from "./ParkUI";
import { ToolCall } from "./ToolCall";

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
  textAlign: "right",
});

const roleLabel = css({
  color: "muted",
  fontSize: "xs",
});

export function ChatPage({
  activeId,
  canControl,
  draft,
  pausing,
  queue,
  view,
  workspace,
  onSend,
  onControl,
  onPickWorkspace,
  onWorkspaceChange,
}: {
  activeId?: string;
  canControl: boolean;
  draft: boolean;
  pausing: boolean;
  queue: DisplayQueue[];
  view: TimelineMessage[];
  workspace?: string;
  onSend(content: string): Promise<void>;
  onControl(control: string): Promise<void>;
  onPickWorkspace(): Promise<string | null>;
  onWorkspaceChange(workspace: string): void;
}) {
  const { t } = useTranslation();
  const paused = queue.some((item) => item.status === "paused");
  const waitingForPause = pausing && !paused;
  if (!activeId) {
    return (
      <div className={page}>
        <div />
        <div className={empty}>{t("empty")}</div>
      </div>
    );
  }
  if (draft) {
    if (workspace === undefined) throw new Error("新建会话缺少工作目录");
    return (
      <NewSessionPage
        pageClassName={page}
        workspace={workspace}
        onPickWorkspace={onPickWorkspace}
        onSend={onSend}
        onWorkspaceChange={onWorkspaceChange}
      />
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
      <section className={scroll}>
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
                <MarkdownView content={part.content} key={`content-${index}`} />
              ) : (
                <ToolCall
                  call={part.call}
                  key={part.call.id}
                  output={part.output}
                />
              ),
            )}
          </article>
        ))}
      </section>
      <Composer disabled={!activeId} onSend={onSend} />
    </div>
  );
}
