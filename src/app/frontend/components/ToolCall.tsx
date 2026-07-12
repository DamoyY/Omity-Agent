import { ChevronRight, Wrench } from "lucide-react";
import { useTranslation } from "react-i18next";
import { css } from "styled-system/css";
import { stringify } from "yaml";
import type { DisplayMessage, DisplayToolCall } from "../../timeline";
import { HighlightedCode } from "./HighlightedCode";
import { Badge } from "./ParkUI";

const details = css({
  bg: "surfaceRaised",
  borderLeftColor: "statusTool",
  borderLeftWidth: "3px",
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
  listStyle: "none",
  maxW: "full",
  px: "3",
  _hover: { bg: "controlHover" },
  "&::-webkit-details-marker": { display: "none" },
});

const disclosure = css({
  color: "muted",
  flexShrink: 0,
  transition: "transform 120ms ease",
  "details[open] &": { transform: "rotate(90deg)" },
});

const toolIcon = css({ color: "statusTool", flexShrink: 0 });

const summaryText = css({
  color: "mutedStrong",
  flex: "1",
  lineHeight: "1",
  minW: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

const ioGrid = css({
  display: "grid",
  gap: "3",
  gridTemplateColumns: {
    base: "minmax(0, 1fr)",
    xl: "repeat(2, minmax(0, 1fr))",
  },
  borderTopColor: "line",
  borderTopWidth: "1px",
  m: "3",
  mt: 0,
  minW: 0,
  pt: "3",
});

const ioPanel = css({
  alignContent: "start",
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
  maxH: "16rem",
  minH: "3rem",
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
});

const imageList = css({
  display: "grid",
  gap: "2",
});

const outputImage = css({
  display: "block",
  h: "auto",
  maxW: "full",
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
        <ChevronRight className={disclosure} size={14} />
        <Wrench className={toolIcon} size={14} />
        <span className={summaryText}>
          {t("toolCall")} · {call.name}
        </span>
        {call.streaming ? <Badge>{t("streaming")}</Badge> : null}
      </summary>
      <div className={ioGrid}>
        <section className={ioPanel}>
          <p className={panelTitle}>{t("input")}</p>
          <HighlightedCode className={codeBlock} code={input} language="yaml" />
        </section>
        {output ? (
          <section className={ioPanel}>
            <p className={panelTitle}>{t("output")}</p>
            {output.content.trim() ? (
              <HighlightedCode className={codeBlock} code={output.content} />
            ) : null}
            {output.images.length > 0 ? (
              <div className={imageList}>
                {output.images.map((image, index) => (
                  <img
                    alt=""
                    className={outputImage}
                    key={`${image.mimeType}-${index.toString()}`}
                    src={image.src}
                  />
                ))}
              </div>
            ) : null}
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
