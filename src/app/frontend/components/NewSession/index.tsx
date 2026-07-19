import type { AttachmentSettings, PendingAttachment } from "../../../attachments/contract";
import { type EditablePair, MessageStack } from "./MessageStack";
import { Plus, Send, UserRound } from "lucide-react";
import { type SubmitEvent, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  composerActions,
  composerControls,
  composerFrame,
  composerRole,
} from "../Chat/Composer/layout";
import { messageFlow, scroll, scrollContent, setup } from "./layout";
import { Button } from "../ParkUI";
import type { InitialSessionState } from "../../../initialState";
import { MarkdownEditor } from "../Chat/MarkdownEditor";
import { PendingAttachments } from "../Chat/Composer/attachments";
import { WorkspacePicker } from "./WorkspacePicker";
import { claimShortId } from "../../../../infrastructure/randomId";
import { reportPromiseErrors } from "../../services/errors";
import { useNewSessionDraft } from "./draft";
import { useTranslation } from "react-i18next";

export function NewSessionPage({
  attachmentSettings,
  draftSaveDelayMs,
  pageClassName,
  recentWorkspaces,
  workspace,
  onCreate,
  onPickWorkspace,
  onWorkspaceChange,
}: {
  attachmentSettings?: AttachmentSettings;
  draftSaveDelayMs?: number;
  pageClassName: string;
  recentWorkspaces: string[];
  workspace: string;
  onCreate: (state: InitialSessionState, attachments: PendingAttachment[]) => Promise<void>;
  onPickWorkspace: () => Promise<string | null>;
  onWorkspaceChange: (workspace: string) => void;
}) {
  const { t } = useTranslation();
  const {
    clear: clearDraft,
    content: message,
    flush: flushDraft,
    loading: draftLoading,
    update: setMessage,
  } = useNewSessionDraft(draftSaveDelayMs);
  const [pairs, setPairs] = useState<EditablePair[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const attachmentsRef = useRef(new PendingAttachments(attachmentSettings));
  const createRef = useRef(onCreate);
  const draftActionsRef = useRef({ clear: clearDraft, flush: flushDraft });
  const previousPairCountRef = useRef(pairs.length);
  useEffect(() => {
    attachmentsRef.current.configure(attachmentSettings);
  }, [attachmentSettings]);
  useLayoutEffect(() => {
    createRef.current = onCreate;
  }, [onCreate]);
  useLayoutEffect(() => {
    draftActionsRef.current = { clear: clearDraft, flush: flushDraft };
  }, [clearDraft, flushDraft]);
  useLayoutEffect(() => {
    const pairAdded = pairs.length > previousPairCountRef.current;
    previousPairCountRef.current = pairs.length;
    if (!pairAdded) {
      return undefined;
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
  const submit = useCallback(async () => {
    const valid =
      workspace.trim().length > 0 &&
      message.trim().length > 0 &&
      pairs.every(({ user, assistant }) => user.trim().length > 0 && assistant.trim().length > 0);
    if (!valid || submitting) {
      return;
    }
    setSubmitting(true);
    try {
      await draftActionsRef.current.flush();
      await createRef.current(
        {
          history: pairs.map(({ user, assistant }) => ({ assistant, user })),
          message,
        },
        attachmentsRef.current.values(message),
      );
      draftActionsRef.current.clear();
    } finally {
      setSubmitting(false);
    }
  }, [message, pairs, submitting, workspace]);
  const handleFormSubmit = useCallback(
    (event: SubmitEvent<HTMLFormElement>) => {
      event.preventDefault();
      reportPromiseErrors(submit());
    },
    [submit],
  );
  const changePair = useCallback((id: string, next: InitialSessionState["history"][number]) => {
    setPairs((current) => current.map((item) => (item.id === id ? { id, ...next } : item)));
  }, []);
  const removePair = useCallback((id: string) => {
    setPairs((current) => current.filter((item) => item.id !== id));
  }, []);
  const handleSubmit = useCallback(() => {
    reportPromiseErrors(submit());
  }, [submit]);
  const pasteFiles = useCallback(
    (files: File[]) => attachmentsRef.current.paste(files, message),
    [message],
  );
  const addPair = useCallback(() => {
    setPairs((current) => {
      const id = claimShortId((candidate) => !current.some((item) => item.id === candidate));
      return [...current, { assistant: "", id, user: "" }];
    });
  }, []);
  return (
    <form className={pageClassName} onSubmit={handleFormSubmit}>
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
              onPairChange={changePair}
              onRemove={removePair}
              onSubmit={handleSubmit}
            />
            <div className={composerFrame}>
              <MarkdownEditor
                disabled={draftLoading || submitting}
                onChange={setMessage}
                onPasteFiles={attachmentSettings ? pasteFiles : undefined}
                onSubmit={handleSubmit}
                placeholder={t("messagePlaceholder")}
                value={message}
              />
              <div className={composerActions}>
                <div className={composerControls}>
                  <Button
                    disabled={draftLoading || !complete || submitting}
                    type="submit"
                    variant="outline"
                  >
                    <Send size={14} />
                    {submitting ? t("creating") : t("createAndSend")}
                  </Button>
                  <Button disabled={submitting} onClick={addPair} type="button" variant="outline">
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
