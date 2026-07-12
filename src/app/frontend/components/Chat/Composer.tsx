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
import { Button, Textarea } from "../ParkUI";

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

const messageBox = css({
  bg: "surfaceInset",
  borderColor: "lineStrong",
  h: "12rem",
  minW: 0,
  resize: "none",
});

const actions = css({
  alignContent: "start",
  display: "grid",
  gap: "1",
  minW: "7rem",
});

type ControlState = "pause" | "pausing" | "resume";

export function Composer({
  disabled,
  draft,
  draftTarget,
  controlDisabled = false,
  controlState,
  onControl,
  onSend,
}: {
  disabled: boolean;
  draft?: string;
  draftTarget: ComposerDraftTarget;
  controlDisabled?: boolean;
  controlState?: ControlState;
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
      <Textarea
        className={messageBox}
        disabled={disabled || loading || submitting}
        placeholder={t("messagePlaceholder")}
        size="md"
        value={content}
        onChange={(event) => {
          const nextContent = event.currentTarget.value;
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
        onKeyDown={(event) => {
          if (event.key !== "Enter" || !event.ctrlKey) return;
          if (event.nativeEvent.isComposing) return;
          event.preventDefault();
          event.currentTarget.form?.requestSubmit();
        }}
      />
      <div className={actions}>
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
    </form>
  );
}
