import type { AttachmentSettings, PendingAttachment } from "../../../attachments/contract";
import { type EditablePair, MessageStack } from "./MessageStack";
import { Plus, Send, UserRound } from "lucide-react";
import {
  composerActions,
  composerControls,
  composerFrame,
  composerRole,
} from "../Chat/Composer/layout";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Button } from "../ParkUI";
import type { InitialSessionState } from "../../../initialState";
import { MarkdownEditor } from "../Chat/MarkdownEditor";
import { PendingAttachments } from "../Chat/Composer/attachments";
import { WorkspacePicker } from "./WorkspacePicker";
import { css } from "styled-system/css";
import { reportPromiseErrors } from "../../services/errors";
import { useTranslation } from "react-i18next";
const scroll = css({ minH: 0, overflowY: "auto" });
const scrollContent = css({
  display: "grid",
  gridTemplateRows: "auto minmax(min-content, 1fr)",
  minH: "full",
});
const setup = css({
  alignContent: "start",
  display: "grid",
  gap: "6",
  maxW: "content",
  minH: "full",
  mx: "auto",
  p: { base: "4", md: "8" },
  w: "full",
});
const messageFlow = css({ alignSelf: "end" });
export function NewSessionPage({
  attachmentSettings,
  pageClassName,
  recentWorkspaces,
  workspace,
  onCreate,
  onPickWorkspace,
  onWorkspaceChange,
}: {
  attachmentSettings?: AttachmentSettings;
  pageClassName: string;
  recentWorkspaces: string[];
  workspace: string;
  onCreate: (state: InitialSessionState, attachments: PendingAttachment[]) => Promise<void>;
  onPickWorkspace: () => Promise<string | null>;
  onWorkspaceChange: (workspace: string) => void;
}) {
  const { t } = useTranslation();
  const [message, setMessage] = useState("");
  const [pairs, setPairs] = useState<EditablePair[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const attachmentsRef = useRef(new PendingAttachments(attachmentSettings));
  const previousPairCountRef = useRef(pairs.length);
  useEffect(() => {
    attachmentsRef.current.configure(attachmentSettings);
  }, [attachmentSettings]);
  useLayoutEffect(() => {
    const pairAdded = pairs.length > previousPairCountRef.current;
    previousPairCountRef.current = pairs.length;
    if (!pairAdded) {
      return;
    }
    const keepLastMessageInPlace = () => {
      const node = scrollRef.current;
      if (node) {
        node.scrollTop = node.scrollHeight;
      }
    };
    keepLastMessageInPlace();
    const frame = requestAnimationFrame(keepLastMessageInPlace);
    return () => {
      cancelAnimationFrame(frame);
    };
  }, [pairs.length]);
  const complete =
    workspace.trim().length > 0 &&
    message.trim().length > 0 &&
    pairs.every(({ user, assistant }) => user.trim().length > 0 && assistant.trim().length > 0);
  const submit = async () => {
    if (!complete || submitting) {
      return;
    }
    setSubmitting(true);
    try {
      await onCreate(
        {
          history: pairs.map(({ user, assistant }) => ({ assistant, user })),
          message,
        },
        attachmentsRef.current.values(message),
      );
    } finally {
      setSubmitting(false);
    }
  };
  return (
    <form
      className={pageClassName}
      onSubmit={(event) => {
        event.preventDefault();
        reportPromiseErrors(submit());
      }}
    >
      <div className={scroll} ref={scrollRef}>
        <div className={scrollContent}>
          <div className={setup}>
            <WorkspacePicker
              recentWorkspaces={recentWorkspaces}
              workspace={workspace}
              onChange={onWorkspaceChange}
              onPick={onPickWorkspace}
            />
          </div>
          <div className={messageFlow}>
            <MessageStack
              pairs={pairs}
              onPairChange={(id, next) => {
                setPairs((current) =>
                  current.map((item) => (item.id === id ? { id, ...next } : item)),
                );
              }}
              onRemove={(id) => {
                setPairs((current) => current.filter((item) => item.id !== id));
              }}
              onSubmit={() => {
                reportPromiseErrors(submit());
              }}
            />
            <div className={composerFrame}>
              <MarkdownEditor
                disabled={submitting}
                onChange={setMessage}
                onPasteFiles={
                  attachmentSettings
                    ? (files) => attachmentsRef.current.paste(files, message)
                    : undefined
                }
                onSubmit={() => {
                  reportPromiseErrors(submit());
                }}
                placeholder={t("messagePlaceholder")}
                value={message}
              />
              <div className={composerActions}>
                <div className={composerControls}>
                  <Button disabled={!complete || submitting} type="submit" variant="outline">
                    <Send size={14} />
                    {submitting ? t("creating") : t("createAndSend")}
                  </Button>
                  <Button
                    disabled={submitting}
                    onClick={() => {
                      setPairs((current) => [
                        ...current,
                        {
                          assistant: "",
                          id: crypto.randomUUID(),
                          user: "",
                        },
                      ]);
                    }}
                    type="button"
                    variant="outline"
                  >
                    <Plus size={14} /> {t("addMessagePair")}
                  </Button>
                </div>
                <span aria-label={t("user")} className={composerRole} title={t("user")}>
                  <UserRound aria-hidden size={20} />
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </form>
  );
}
