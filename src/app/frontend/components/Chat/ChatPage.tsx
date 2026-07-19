import type { AttachmentSettings, PendingAttachment } from "../../../attachments/contract";
import type { Control, SessionStatus } from "../../../../types";
import type { DisplayQueue, TimelineMessage } from "../../../timeline";
import { useCallback, useMemo } from "react";
import { Composer } from "./Composer/index";
import type { InitialSessionState } from "../../../initialState";
import { Message } from "./Message";
import { NewSessionPage } from "../NewSession";
import { TranscriptScroll } from "../TranscriptScroll";
import { css } from "styled-system/css";
import { deriveChatActionState } from "./actionState";
import { useTranslation } from "react-i18next";

const page = css({
  display: "grid",
  gridTemplateRows: "minmax(0, 1fr) auto",
  h: "full",
  maxW: { _largeCanvas: "chatCanvas" },
  minH: 0,
  minW: 0,
  mx: "auto",
  overflow: "hidden",
  w: "full",
});
const empty = css({
  color: "muted",
  display: "grid",
  h: "full",
  placeItems: "center",
});
function findLatestDetail(view: TimelineMessage[]) {
  for (let messageIndex = view.length - 1; messageIndex >= 0; messageIndex -= 1) {
    const item = view[messageIndex];
    if (item) {
      const partIndex = item.parts.findLastIndex((part) => part.type !== "content");
      if (partIndex !== -1) {
        return { messageKey: item.key, partIndex };
      }
    }
  }
  return undefined;
}
export function ChatPage({
  activeId,
  attachmentSettings,
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
  onCancelTool,
  onSend,
  onControl,
  onDelete,
  onFork,
  onPickWorkspace,
  onWorkspaceChange,
}: {
  activeId?: string;
  attachmentSettings?: AttachmentSettings;
  control: Control;
  draftSaveDelayMs?: number;
  newSession: boolean;
  pausing: boolean;
  queue: DisplayQueue[];
  recentWorkspaces: string[];
  sessionStatus?: SessionStatus;
  view: TimelineMessage[];
  workspace?: string;
  onCreate: (state: InitialSessionState, attachments: PendingAttachment[]) => Promise<void>;
  onCancelTool: (toolCallId: string) => Promise<void>;
  onSend: (
    content: string,
    draftRevision: number,
    attachments: PendingAttachment[],
  ) => Promise<void>;
  onControl: (control: Extract<Control, "running" | "pause">) => Promise<void>;
  onDelete: () => Promise<void>;
  onFork: (messageId: number) => Promise<void>;
  onPickWorkspace: () => Promise<string | null>;
  onWorkspaceChange: (workspace: string) => void;
}) {
  const { t } = useTranslation();
  const actionState = deriveChatActionState({
    control,
    pausing,
    queue,
    sessionStatus,
  });
  const firstUserMessageId = view.find((item) => item.role === "user")?.id;
  const forkDraft = queue.find((item) => item.status === "draft")?.content;
  const latestDetail = findLatestDetail(view);
  const latestUsage = view.findLast((item) => item.usage !== undefined)?.usage ?? null;
  const draftTarget = useMemo(
    () =>
      activeId ? ({ kind: "session", sessionId: activeId } as const) : ({ kind: "new" } as const),
    [activeId],
  );
  const userMessages = useMemo(
    () => view.filter((item) => item.role === "user").map((item) => item.content),
    [view],
  );
  const handleControl = useCallback(
    () => onControl(actionState.nextControl),
    [actionState.nextControl, onControl],
  );
  if (!activeId) {
    if (newSession) {
      return (
        <NewSessionPage
          attachmentSettings={attachmentSettings}
          draftSaveDelayMs={draftSaveDelayMs}
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
        {view.length === 0 ? <div className={empty}>{t("noMessages")}</div> : null}
        {view.map((item) => (
          <Message
            canFork={item.role === "user" && item.id > 0 && item.id !== firstUserMessageId}
            forkDisabled={actionState.queueRunning}
            item={item}
            key={item.key}
            latestDetailIndex={
              item.key === latestDetail?.messageKey ? latestDetail.partIndex : undefined
            }
            onFork={onFork}
            onCancelTool={onCancelTool}
          />
        ))}
      </TranscriptScroll>
      <Composer
        attachmentSettings={attachmentSettings}
        controlDisabled={actionState.controlDisabled}
        controlState={actionState.controlState}
        deleteDisabled={actionState.deleteDisabled}
        disabled={!activeId}
        draft={forkDraft}
        draftSaveDelayMs={draftSaveDelayMs}
        draftTarget={draftTarget}
        key={forkDraft === undefined ? activeId : `draft:${forkDraft}`}
        userMessages={userMessages}
        usage={latestUsage}
        onControl={handleControl}
        onDelete={onDelete}
        onSend={onSend}
      />
    </div>
  );
}
