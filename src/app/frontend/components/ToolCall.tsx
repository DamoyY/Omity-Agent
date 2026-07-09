import { useTranslation } from "react-i18next";
import { css } from "styled-system/css";
import { stringify } from "yaml";
import type { DisplayMessage, DisplayToolCall } from "../../timeline";
import { HighlightedCode } from "./HighlightedCode";

const details = css({
  bg: "surfaceInset",
  borderWidth: "1px",
  borderColor: "line",
  color: "muted",
  fontFamily: "mono",
  fontSize: "sm",
  maxW: "full",
  mt: "2",
  minW: 0,
  p: 0,
  w: "full",
  "& pre": {
    maxW: "full",
    m: 0,
  },
});

const summary = css({
  alignItems: "center",
  cursor: "pointer",
  display: "flex",
  gap: "2",
  h: "3rem",
  maxW: "full",
  px: "3",
});

const summaryText = css({
  color: "mutedStrong",
  lineHeight: "1",
});

const ioGrid = css({
  display: "grid",
  gap: "3",
  gridTemplateColumns: {
    base: "minmax(0, 1fr)",
    xl: "repeat(2, minmax(0, 1fr))",
  },
  m: "3",
  mt: 0,
  minW: 0,
});

const ioPanel = css({
  display: "grid",
  gap: "2",
  minW: 0,
});

const panelTitle = css({
  color: "mutedStrong",
  fontSize: "xs",
  m: 0,
});

const codeBlock = css({
  h: "16rem",
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
});

export function ToolCall({
  call,
  output,
}: {
  call: DisplayToolCall;
  output?: DisplayMessage;
}) {
  const { t } = useTranslation();
  const input = formatToolInput(call);
  return (
    <details className={details}>
      <summary className={summary}>
        <span className={summaryText}>
          {t("toolCall")} · {call.name}
        </span>
        {call.streaming ? (
          <span className={summaryText}>{t("streaming")}</span>
        ) : null}
      </summary>
      <div className={ioGrid}>
        <section className={ioPanel}>
          <p className={panelTitle}>{t("input")}</p>
          <HighlightedCode className={codeBlock} code={input} language="yaml" />
        </section>
        {output ? (
          <section className={ioPanel}>
            <p className={panelTitle}>{t("output")}</p>
            <HighlightedCode className={codeBlock} code={output.content} />
          </section>
        ) : null}
      </div>
    </details>
  );
}

function formatToolInput(call: DisplayToolCall) {
  return stringify(parseInputText(call.inputText) ?? call.input, {
    lineWidth: 0,
  });
}

function parseInputText(text?: string) {
  if (!text) return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}
