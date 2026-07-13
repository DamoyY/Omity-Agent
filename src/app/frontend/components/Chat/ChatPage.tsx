import { useTranslation } from "react-i18next";
import { css } from "styled-system/css";
import type { DisplayQueue, TimelineMessage } from "../../../timeline";
import type { Control, SessionStatus } from "../../../../types";
import { Composer } from "./Composer";
import { NewSessionPage } from "../NewSession";
import { TranscriptScroll } from "../TranscriptScroll";
import { Message } from "./Message";
import type { InitialSessionState } from "../../../initialState";

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

function findLatestDetail(view: TimelineMessage[]) {
  for (
    let messageIndex = view.length - 1;
    messageIndex >= 0;
    messageIndex -= 1
  ) {
    const item = view[messageIndex];
    if (!item) continue;
    const partIndex = item.parts.findLastIndex(
      (part) => part.type !== "content",
    );
    if (partIndex >= 0) return { messageKey: item.key, partIndex };
  }
  return undefined;
}

export function ChatPage({
  activeId,
  control,
  draftSaveDelayMs,
  newSession,
  pausing,
  queue,
  recentWorkspaces,
  sessionStatus,
  view,
  workspace,
  onCreate,
  onSend,
  onControl,
  onDelete,
  onFork,
  onPickWorkspace,
  onWorkspaceChange,
}: {
  activeId?: string;
  control: Control;
  draftSaveDelayMs?: number;
  newSession: boolean;
  pausing: boolean;
  queue: DisplayQueue[];
  recentWorkspaces: string[];
  sessionStatus?: SessionStatus;
  view: TimelineMessage[];
  workspace?: string;
  onCreate: (state: InitialSessionState) => Promise<void>;
  onSend: (content: string, draftRevision: number) => Promise<void>;
  onControl: (control: Extract<Control, "running" | "pause">) => Promise<void>;
  onDelete: () => Promise<void>;
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
  const latestDetail = findLatestDetail(view);
  const latestUsage =
    view.findLast((item) => item.usage !== undefined)?.usage ?? null;

  if (!activeId) {
    if (newSession) {
      return (
        <NewSessionPage
          pageClassName={page}
          recentWorkspaces={recentWorkspaces}
          workspace={workspace ?? ""}
          onCreate={onCreate}
          onPickWorkspace={onPickWorkspace}
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
      <TranscriptScroll activeId={activeId} view={view}>
        {view.length === 0 ? (
          <div className={empty}>{t("noMessages")}</div>
        ) : null}
        {view.map((item) => (
          <Message
            canFork={
              item.role === "user" &&
              item.id > 0 &&
              item.id !== firstUserMessageId
            }
            forkDisabled={loopRunning}
            item={item}
            key={item.key}
            latestDetailIndex={
              item.key === latestDetail?.messageKey
                ? latestDetail.partIndex
                : undefined
            }
            onFork={onFork}
          />
        ))}
      </TranscriptScroll>
      <Composer
        controlDisabled={
          waitingForPause || (!paused && sessionStatus === "idle")
        }
        controlState={waitingForPause ? "pausing" : paused ? "resume" : "pause"}
        deleteDisabled={
          loopRunning || sessionStatus === "model" || sessionStatus === "tool"
        }
        disabled={!activeId}
        draft={forkDraft}
        draftSaveDelayMs={draftSaveDelayMs}
        draftTarget={{ kind: "session", sessionId: activeId }}
        key={forkDraft === undefined ? activeId : `draft:${forkDraft}`}
        usage={latestUsage}
        onControl={() => onControl(paused ? "running" : "pause")}
        onDelete={onDelete}
        onSend={onSend}
      />
    </div>
  );
}
