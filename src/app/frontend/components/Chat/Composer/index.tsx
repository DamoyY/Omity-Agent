import {
  type ComposerDraftTarget,
  clearTemporaryComposerDraft,
  flushComposerDraft,
  readComposerDraft,
} from "../../../services/composerDrafts";
import { type HistoryDirection, UserMessageHistory } from "./history";
import { type SubmitEvent, useCallback, useEffect, useRef, useState } from "react";
import { reportError, reportPromiseErrors } from "../../../services/errors";
import { Actions } from "./Actions";
import type { ComposerProps } from "./props";
import { DraftSaver } from "../../../services/scheduling/draftSaver";
import { MarkdownEditor } from "../MarkdownEditor";
import { PendingAttachments } from "./attachments";
import { composerFrame } from "./layout";
import { useTranslation } from "react-i18next";

export function Composer({
  disabled,
  attachmentSettings,
  draft,
  draftSaveDelayMs,
  draftTarget,
  userMessages,
  controlDisabled = false,
  controlState,
  deleteDisabled = false,
  usage,
  onControl,
  onDelete,
  onSend,
}: ComposerProps) {
  const { t } = useTranslation();
  const [content, setContent] = useState(draft ?? "");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const contentRef = useRef(content);
  const attachmentsRef = useRef(new PendingAttachments(attachmentSettings));
  const historyRef = useRef(new UserMessageHistory());
  const revisionRef = useRef(0);
  const saverRef = useRef<DraftSaver | undefined>(undefined);
  const submittingRef = useRef(false);
  const sessionId = draftTarget.kind === "session" ? draftTarget.sessionId : undefined;
  useEffect(() => {
    attachmentsRef.current.configure(attachmentSettings);
  }, [attachmentSettings]);
  useEffect(() => {
    let current = true;
    const target: ComposerDraftTarget = sessionId
      ? { kind: "session", sessionId }
      : { kind: "new" };
    const load = async () => {
      const loaded = await readComposerDraft(target, draft ?? "");
      if (!current) {
        return;
      }
      revisionRef.current = loaded.revision;
      contentRef.current = loaded.content;
      historyRef.current.reset();
      setContent(loaded.content);
      setLoading(false);
    };
    reportPromiseErrors(load());
    return () => {
      current = false;
    };
  }, [draft, sessionId]);
  useEffect(() => {
    if (draftSaveDelayMs === undefined) {
      return undefined;
    }
    const target: ComposerDraftTarget = sessionId
      ? { kind: "session", sessionId }
      : { kind: "new" };
    const saver = new DraftSaver(target, draftSaveDelayMs, reportError);
    saverRef.current = saver;
    return () => {
      if (saverRef.current === saver) {
        saverRef.current = undefined;
      }
      reportPromiseErrors(saver.flush());
    };
  }, [draftSaveDelayMs, sessionId]);
  useEffect(() => {
    const target: ComposerDraftTarget = sessionId
      ? { kind: "session", sessionId }
      : { kind: "new" };
    const flush = () => {
      flushComposerDraft(target, contentRef.current, revisionRef.current);
    };
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
    };
  }, [sessionId]);
  const updateContent = useCallback((nextContent: string) => {
    if (nextContent === contentRef.current) {
      return;
    }
    contentRef.current = nextContent;
    setContent(nextContent);
    revisionRef.current += 1;
    saverRef.current?.schedule(nextContent, revisionRef.current);
  }, []);
  const navigateHistory = useCallback(
    (direction: HistoryDirection) => {
      const nextContent = historyRef.current.navigate(direction, contentRef.current, userMessages);
      if (nextContent === undefined) {
        return undefined;
      }
      updateContent(nextContent);
      return nextContent;
    },
    [updateContent, userMessages],
  );
  const submit = useCallback(async () => {
    const submittedContent = contentRef.current;
    if (submittingRef.current || !submittedContent.trim()) {
      return;
    }
    const submittedRevision = revisionRef.current;
    submittingRef.current = true;
    setSubmitting(true);
    saverRef.current?.discardPending();
    historyRef.current.reset();
    if (draftTarget.kind === "new") {
      clearTemporaryComposerDraft();
    }
    contentRef.current = "";
    setContent("");
    try {
      await onSend(
        submittedContent,
        submittedRevision,
        attachmentsRef.current.values(submittedContent),
      );
      attachmentsRef.current.clear();
    } catch (error) {
      revisionRef.current += 1;
      contentRef.current = submittedContent;
      setContent(submittedContent);
      saverRef.current?.schedule(submittedContent, revisionRef.current);
      throw error;
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }, [draftTarget.kind, onSend]);
  const handleSubmit = useCallback(() => {
    reportPromiseErrors(submit());
  }, [submit]);
  const handleFormSubmit = useCallback(
    (event: SubmitEvent<HTMLFormElement>) => {
      event.preventDefault();
      handleSubmit();
    },
    [handleSubmit],
  );
  const handleContentChange = useCallback(
    (nextContent: string) => {
      if (nextContent === contentRef.current) {
        return;
      }
      historyRef.current.reset();
      updateContent(nextContent);
    },
    [updateContent],
  );
  const handlePasteFiles = useCallback(
    (files: File[]) => attachmentsRef.current.paste(files, contentRef.current),
    [],
  );
  const editorDisabled = disabled || loading || submitting;
  return (
    <form className={composerFrame} onSubmit={handleFormSubmit}>
      <MarkdownEditor
        disabled={editorDisabled}
        onChange={handleContentChange}
        onHistoryNavigate={navigateHistory}
        onPasteFiles={attachmentSettings ? handlePasteFiles : undefined}
        onSubmit={handleSubmit}
        placeholder={t("messagePlaceholder")}
        value={content}
      />
      <Actions
        controlDisabled={controlDisabled}
        controlState={controlState}
        deleteDisabled={deleteDisabled}
        submitDisabled={editorDisabled}
        usage={usage}
        onControl={onControl}
        onDelete={onDelete}
      />
    </form>
  );
}
