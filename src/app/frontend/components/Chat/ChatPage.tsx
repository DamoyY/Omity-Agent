import { useTranslation } from "react-i18next";
import { css } from "styled-system/css";
import type { DisplayQueue, TimelineMessage } from "../../../timeline";
import type { Control, SessionStatus } from "../../../../types";
import { Composer } from "./Composer/index";
import { NewSessionPage } from "../NewSession";
import { TranscriptScroll } from "../TranscriptScroll";
import { Message } from "./Message";
import type { InitialSessionState } from "../../../initialState";
import type {
  AttachmentSettings,
  PendingAttachment,
} from "../../../attachments/contract";
import { deriveChatActionState } from "./actionState";

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
  onCreate: (
    state: InitialSessionState,
    attachments: PendingAttachment[],
  ) => Promise<void>;
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
  const latestUsage =
    view.findLast((item) => item.usage !== undefined)?.usage ?? null;

  if (!activeId) {
    if (newSession) {
      return (
        <NewSessionPage
          attachmentSettings={attachmentSettings}
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
            forkDisabled={actionState.queueRunning}
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
        attachmentSettings={attachmentSettings}
        controlDisabled={actionState.controlDisabled}
        controlState={actionState.controlState}
        deleteDisabled={actionState.deleteDisabled}
        disabled={!activeId}
        draft={forkDraft}
        draftSaveDelayMs={draftSaveDelayMs}
        draftTarget={{ kind: "session", sessionId: activeId }}
        key={forkDraft === undefined ? activeId : `draft:${forkDraft}`}
        userMessages={view
          .filter((item) => item.role === "user")
          .map((item) => item.content)}
        usage={latestUsage}
        onControl={() => onControl(actionState.nextControl)}
        onDelete={onDelete}
        onSend={onSend}
      />
    </div>
  );
}
