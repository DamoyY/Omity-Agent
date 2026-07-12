import { Pause, Play, Send } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { css } from "styled-system/css";
import {
  clearTemporaryComposerDraft,
  flushComposerDraft,
  readComposerDraft,
  writeComposerDraft,
  type ComposerDraftTarget,
} from "../../services/composerDrafts";
import { reportError, reportPromiseErrors } from "../../services/errors";
import type { TokenUsage } from "../../../timeline";
import { Button } from "../ParkUI";
import { ContextUsage } from "./ContextUsage";
import { MarkdownEditor } from "./MarkdownEditor";

const form = css({
  bg: "surface",
  borderTopWidth: "1px",
  borderTopColor: "line",
  display: "grid",
  gap: "3",
  gridTemplateColumns: "minmax(0, 1fr) auto",
  p: "6",
  w: "full",
});

const actions = css({
  display: "flex",
  flexDirection: "column",
  h: "full",
  minW: "9rem",
});

const controls = css({ display: "grid", gap: "2" });

type ControlState = "pause" | "pausing" | "resume";

export function Composer({
  disabled,
  draft,
  draftTarget,
  controlDisabled = false,
  controlState,
  usage,
  onControl,
  onSend,
}: {
  disabled: boolean;
  draft?: string;
  draftTarget: ComposerDraftTarget;
  controlDisabled?: boolean;
  controlState?: ControlState;
  usage?: TokenUsage | null;
  onControl?: () => Promise<void>;
  onSend: (content: string, draftRevision: number) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [content, setContent] = useState(draft ?? "");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const contentRef = useRef(content);
  const revisionRef = useRef(0);
  const saveRef = useRef(Promise.resolve());
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
    if (submittingRef.current || !content.trim()) return;
    submittingRef.current = true;
    setSubmitting(true);
    try {
      await saveRef.current;
      await onSend(content, revisionRef.current);
      if (draftTarget.kind === "new") clearTemporaryComposerDraft();
      contentRef.current = "";
      setContent("");
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };
  return (
    <form
      className={form}
      onSubmit={(event) => {
        event.preventDefault();
        reportPromiseErrors(submit());
      }}
    >
      <MarkdownEditor
        disabled={disabled || loading || submitting}
        onChange={(nextContent) => {
          contentRef.current = nextContent;
          setContent(nextContent);
          revisionRef.current += 1;
          const revision = revisionRef.current;
          saveRef.current = saveRef.current
            .catch((error: unknown) => {
              reportError(error);
            })
            .then(async () => {
              await writeComposerDraft(draftTarget, nextContent, revision);
            });
          reportPromiseErrors(saveRef.current);
        }}
        onSubmit={() => {
          reportPromiseErrors(submit());
        }}
        placeholder={t("messagePlaceholder")}
        value={content}
      />
      <div className={actions}>
        <div className={controls}>
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
        </div>
        {usage !== undefined ? <ContextUsage usage={usage} /> : null}
      </div>
    </form>
  );
}
