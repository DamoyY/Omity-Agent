import { Pause, Play, Send } from "lucide-react";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { css } from "styled-system/css";
import {
  clearComposerDraft,
  readComposerDraft,
  writeComposerDraft,
  type ComposerDraftTarget,
} from "../../services/composerDrafts";
import { reportPromiseErrors } from "../../services/errors";
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
  onSend: (content: string) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [content, setContent] = useState(() =>
    readComposerDraft(draftTarget, draft ?? ""),
  );
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const submit = async () => {
    if (submittingRef.current || !content.trim()) return;
    submittingRef.current = true;
    setSubmitting(true);
    try {
      await onSend(content);
      clearComposerDraft(draftTarget);
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
        disabled={disabled || submitting}
        placeholder={t("messagePlaceholder")}
        size="md"
        value={content}
        onChange={(event) => {
          const nextContent = event.currentTarget.value;
          setContent(nextContent);
          writeComposerDraft(draftTarget, nextContent);
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
          disabled={disabled || submitting}
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
