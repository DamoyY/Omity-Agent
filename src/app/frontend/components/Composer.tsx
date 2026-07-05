import { Send } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { css } from "styled-system/css";
import { button, textInput } from "../design";

const form = css({
  borderTopWidth: "1px",
  borderTopColor: "line",
  display: "grid",
  gap: "3",
  gridTemplateColumns: "1fr auto",
  p: "4",
});

const messageBox = css({
  minH: "5rem",
  resize: "vertical",
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
      <textarea
        className={`${textInput} ${messageBox}`}
        disabled={disabled}
        placeholder={t("messagePlaceholder")}
        value={content}
        onChange={(event) => setContent(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.key !== "Enter" || !event.ctrlKey) return;
          if (event.nativeEvent.isComposing) return;
          event.preventDefault();
          event.currentTarget.form?.requestSubmit();
        }}
      />
      <button className={button()} disabled={disabled} type="submit">
        <Send size={14} /> {t("send")}
      </button>
    </form>
  );
}
