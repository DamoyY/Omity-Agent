import { Pause, Play, Send } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  clearTemporaryComposerDraft,
  flushComposerDraft,
  readComposerDraft,
  type ComposerDraftTarget,
} from "../../services/composerDrafts";
import { DraftSaver } from "../../services/scheduling/draftSaver";
import { reportError, reportPromiseErrors } from "../../services/errors";
import type { TokenUsage } from "../../../timeline";
import { Button } from "../ParkUI";
import { ContextUsage } from "./ContextUsage";
import {
  composerActions,
  composerControls,
  composerFrame,
} from "./ComposerFrame";
import { DeleteSessionButton } from "./DeleteSessionButton";
import { MarkdownEditor } from "./MarkdownEditor";

type ControlState = "pause" | "pausing" | "resume";

export function Composer({
  disabled,
  draft,
  draftSaveDelayMs,
  draftTarget,
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
  const submit = async () => {
    const submittedContent = contentRef.current;
    if (submittingRef.current || !submittedContent.trim()) return;
    const submittedRevision = revisionRef.current;
    submittingRef.current = true;
    setSubmitting(true);
    saverRef.current?.discardPending();
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
  return (
    <form
      className={composerFrame}
      onSubmit={(event) => {
        event.preventDefault();
        reportPromiseErrors(submit());
      }}
    >
      <MarkdownEditor
        disabled={disabled || loading || submitting}
        onChange={(nextContent) => {
          if (nextContent === contentRef.current) return;
          contentRef.current = nextContent;
          setContent(nextContent);
          revisionRef.current += 1;
          saverRef.current?.schedule(nextContent, revisionRef.current);
        }}
        onSubmit={() => {
          reportPromiseErrors(submit());
        }}
        placeholder={t("messagePlaceholder")}
        value={content}
      />
      <div className={composerActions}>
        <div className={composerControls}>
          <Button
            disabled={disabled || loading || submitting}
            type="submit"
            variant="outline"
          >
            <Send size={14} /> {t("send")}
          </Button>
          {controlState && onControl ? (
            <Button
              disabled={controlDisabled}
              onClick={() => {
                reportPromiseErrors(onControl());
              }}
              type="button"
              variant="outline"
            >
              {controlState === "resume" ? (
                <Play size={14} />
              ) : (
                <Pause size={14} />
              )}
              {t(controlState)}
            </Button>
          ) : null}
          {onDelete ? (
            <DeleteSessionButton
              disabled={deleteDisabled}
              onDelete={onDelete}
            />
          ) : null}
        </div>
        {usage !== undefined ? <ContextUsage usage={usage} /> : null}
      </div>
    </form>
  );
}
