import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  clearTemporaryComposerDraft,
  flushComposerDraft,
  readComposerDraft,
  type ComposerDraftTarget,
} from "../../../services/composerDrafts";
import { reportError, reportPromiseErrors } from "../../../services/errors";
import { DraftSaver } from "../../../services/scheduling/draftSaver";
import type { TokenUsage } from "../../../../timeline";
import { MarkdownEditor } from "../MarkdownEditor";
import { Actions } from "./Actions";
import { UserMessageHistory, type HistoryDirection } from "./history";
import { composerFrame } from "./layout";

type ControlState = "pause" | "pausing" | "resume";

export function Composer({
  disabled,
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
}: {
  disabled: boolean;
  draft?: string;
  draftSaveDelayMs?: number;
  draftTarget: ComposerDraftTarget;
  userMessages: readonly string[];
  controlDisabled?: boolean;
  controlState?: ControlState;
  deleteDisabled?: boolean;
  usage?: TokenUsage | null;
  onControl?: () => Promise<void>;
  onDelete?: () => Promise<void>;
  onSend: (content: string, draftRevision: number) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [content, setContent] = useState(draft ?? "");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const contentRef = useRef(content);
  const historyRef = useRef(new UserMessageHistory());
  const revisionRef = useRef(0);
  const saverRef = useRef<DraftSaver | undefined>(undefined);
  const submittingRef = useRef(false);
  const sessionId =
    draftTarget.kind === "session" ? draftTarget.sessionId : undefined;

  useEffect(() => {
    let current = true;
    const target: ComposerDraftTarget = sessionId
      ? { kind: "session", sessionId }
      : { kind: "new" };
    reportPromiseErrors(
      readComposerDraft(target, draft ?? "").then((loaded) => {
        if (!current) return;
        revisionRef.current = loaded.revision;
        contentRef.current = loaded.content;
        historyRef.current.reset();
        setContent(loaded.content);
        setLoading(false);
      }),
    );
    return () => {
      current = false;
    };
  }, [draft, sessionId]);

  useEffect(() => {
    if (draftSaveDelayMs === undefined) return;
    const target: ComposerDraftTarget = sessionId
      ? { kind: "session", sessionId }
      : { kind: "new" };
    const saver = new DraftSaver(target, draftSaveDelayMs, reportError);
    saverRef.current = saver;
    return () => {
      if (saverRef.current === saver) saverRef.current = undefined;
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

  const updateContent = (nextContent: string) => {
    if (nextContent === contentRef.current) return;
    contentRef.current = nextContent;
    setContent(nextContent);
    revisionRef.current += 1;
    saverRef.current?.schedule(nextContent, revisionRef.current);
  };

  const navigateHistory = (direction: HistoryDirection) => {
    const nextContent = historyRef.current.navigate(
      direction,
      contentRef.current,
      userMessages,
    );
    if (nextContent === undefined) return undefined;
    updateContent(nextContent);
    return nextContent;
  };

  const submit = async () => {
    const submittedContent = contentRef.current;
    if (submittingRef.current || !submittedContent.trim()) return;
    const submittedRevision = revisionRef.current;
    submittingRef.current = true;
    setSubmitting(true);
    saverRef.current?.discardPending();
    historyRef.current.reset();
    if (draftTarget.kind === "new") clearTemporaryComposerDraft();
    contentRef.current = "";
    setContent("");
    try {
      await onSend(submittedContent, submittedRevision);
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
  };

  const editorDisabled = disabled || loading || submitting;
  return (
    <form
      className={composerFrame}
      onSubmit={(event) => {
        event.preventDefault();
        reportPromiseErrors(submit());
      }}
    >
      <MarkdownEditor
        disabled={editorDisabled}
        onChange={(nextContent) => {
          if (nextContent === contentRef.current) return;
          historyRef.current.reset();
          updateContent(nextContent);
        }}
        onHistoryNavigate={navigateHistory}
        onSubmit={() => {
          reportPromiseErrors(submit());
        }}
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
