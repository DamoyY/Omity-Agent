import { useTranslation } from "react-i18next";
import { css } from "styled-system/css";
import type { Message, ToolCall as ToolCallData } from "../services/client";

const details = css({
  borderWidth: "1px",
  borderColor: "line",
  color: "muted",
  fontFamily: "mono",
  fontSize: "sm",
  mt: "2",
  p: "3",
});

const summary = css({
  cursor: "pointer",
  color: "text",
});

const pre = css({
  overflowX: "auto",
  whiteSpace: "pre-wrap",
});

export function ToolCall({
  call,
  output,
}: {
  call: ToolCallData;
  output?: Message;
}) {
  const { t } = useTranslation();
  return (
    <details className={details}>
      <summary className={summary}>
        {t("toolCall")} · {call.name}
      </summary>
      <p>{t("input")}</p>
      <pre className={pre}>{JSON.stringify(call.input, null, 2)}</pre>
      {output ? (
        <>
          <p>{t("output")}</p>
          <pre className={pre}>{output.content}</pre>
        </>
      ) : null}
    </details>
  );
}
