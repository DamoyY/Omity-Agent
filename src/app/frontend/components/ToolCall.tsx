import { useTranslation } from "react-i18next";
import { css } from "styled-system/css";
import type { Message, ToolCall as ToolCallData } from "../services/client";
import { Badge, Code } from "./ParkUI";

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
});

const codeBlock = css({
  display: "block",
  overflowX: "auto",
  p: "3",
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
        <Badge size="sm" variant="outline">
          {t("toolCall")} · {call.name}
        </Badge>
      </summary>
      <p>{t("input")}</p>
      <pre>
        <Code className={codeBlock} size="sm" variant="outline">
          {JSON.stringify(call.input, null, 2)}
        </Code>
      </pre>
      {output ? (
        <>
          <p>{t("output")}</p>
          <pre>
            <Code className={codeBlock} size="sm" variant="outline">
              {output.content}
            </Code>
          </pre>
        </>
      ) : null}
    </details>
  );
}
