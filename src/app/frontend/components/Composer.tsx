import { Send } from "lucide-react";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { css } from "styled-system/css";
import { Button, Textarea } from "./ParkUI";
import { reportPromiseErrors } from "../services/errors";

const form = css({
  bg: "surface",
  borderTopWidth: "1px",
  borderTopColor: "line",
  display: "grid",
  gap: "3",
  gridTemplateColumns: "minmax(0, 1fr) auto",
  px: "6",
  py: "3",
  w: "full",
});

const messageBox = css({
  bg: "surfaceInset",
  borderColor: "lineStrong",
  h: "12rem",
  minW: 0,
  resize: "none",
});

const sendButton = css({
  alignSelf: "stretch",
});

export function Composer({
  disabled,
  draft,
  onSend,
}: {
  disabled: boolean;
  draft?: string;
  onSend: (content: string) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [content, setContent] = useState(draft ?? "");
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const submit = async () => {
    if (submittingRef.current || !content.trim()) return;
    submittingRef.current = true;
    setSubmitting(true);
    try {
      await onSend(content);
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
          setContent(event.currentTarget.value);
        }}
        onKeyDown={(event) => {
          if (event.key !== "Enter" || !event.ctrlKey) return;
          if (event.nativeEvent.isComposing) return;
          event.preventDefault();
          event.currentTarget.form?.requestSubmit();
        }}
      />
      <Button
        className={sendButton}
        disabled={disabled || submitting}
        type="submit"
        variant="outline"
      >
        <Send size={14} /> {t("send")}
      </Button>
    </form>
  );
}
