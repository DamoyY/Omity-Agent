import { Send } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { css } from "styled-system/css";
import { Button, Textarea } from "./ParkUI";

const form = css({
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
  h: "9rem",
  minW: 0,
  resize: "none",
});

const sendButton = css({
  alignSelf: "stretch",
});

export function Composer({
  disabled,
  onSend,
}: {
  disabled: boolean;
  onSend(content: string): Promise<void>;
}) {
  const { t } = useTranslation();
  const [content, setContent] = useState("");
  return (
    <form
      className={form}
      onSubmit={(event) => {
        event.preventDefault();
        if (!content.trim()) return;
        void onSend(content).then(() => setContent(""));
      }}
    >
      <Textarea
        className={messageBox}
        disabled={disabled}
        placeholder={t("messagePlaceholder")}
        size="md"
        value={content}
        onChange={(event) => setContent(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.key !== "Enter" || !event.ctrlKey) return;
          if (event.nativeEvent.isComposing) return;
          event.preventDefault();
          event.currentTarget.form?.requestSubmit();
        }}
      />
      <Button
        className={sendButton}
        disabled={disabled}
        type="submit"
        variant="outline"
      >
        <Send size={14} /> {t("send")}
      </Button>
    </form>
  );
}
