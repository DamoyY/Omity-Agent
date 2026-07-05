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
  maxW: "full",
  mt: "2",
  minW: 0,
  p: "3",
  w: "fit-content",
  "& pre": {
    maxW: "full",
    m: 0,
    overflowX: "auto",
  },
});

const summary = css({
  cursor: "pointer",
  maxW: "full",
});

const codeBlock = css({
  display: "block",
  maxW: "full",
  overflowX: "auto",
  p: "3",
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
});

export function ToolCall({
  call,
  output,
}: {
  call: ToolCallData;
  output?: Message;
}) {
  const { t } = useTranslation();
  const input = call.inputText ?? JSON.stringify(call.input, null, 2);
  return (
    <details className={details}>
      <summary className={summary}>
        <Badge size="sm" variant="outline">
          {t("toolCall")} · {call.name}
        </Badge>
        {call.streaming ? (
          <Badge size="sm" variant="outline">
            {t("streaming")}
          </Badge>
        ) : null}
      </summary>
      <p>{t("input")}</p>
      <pre>
        <Code className={codeBlock} size="sm" variant="outline">
          {input}
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
