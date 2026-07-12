import { Wrench } from "lucide-react";
import { useTranslation } from "react-i18next";
import { css } from "styled-system/css";
import { stringify } from "yaml";
import type { DisplayMessage, DisplayToolCall } from "../../../timeline";
import { HighlightedCode } from "../HighlightedCode";
import { Badge } from "../ParkUI";
import { Frame } from "./Frame";
const ioGrid = css({
  borderTopColor: "line",
  borderTopWidth: "1px",
  display: "grid",
  gap: "3",
  gridTemplateColumns: {
    base: "minmax(0, 1fr)",
    xl: "repeat(2, minmax(0, 1fr))",
  },
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
const panelTitle = css({ color: "mutedStrong", fontSize: "xs", m: 0 });
const codeBlock = css({
  maxH: "16rem",
  minH: "3rem",
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
});
const imageList = css({ display: "grid", gap: "2" });
const outputImage = css({ display: "block", h: "auto", maxW: "full" });
export function ToolCall({
  call,
  latest,
  output,
}: {
  call: DisplayToolCall;
  latest: boolean;
  output?: DisplayMessage;
}) {
  const { t } = useTranslation();
  return (
    <Frame
      accessory={call.streaming ? <Badge>{t("streaming")}</Badge> : undefined}
      expandedInitially={latest}
      icon={Wrench}
      label={`${t("toolCall")}: ${call.name}`}
      title={call.name}
      tone="tool"
    >
      <div className={ioGrid}>
        <section className={ioPanel}>
          <p className={panelTitle}>{t("input")}</p>
          <HighlightedCode
            autoFollow={latest}
            className={codeBlock}
            code={formatToolInput(call)}
            language="yaml"
          />
        </section>
        {output ? (
          <section className={ioPanel}>
            <p className={panelTitle}>{t("output")}</p>
            {output.content.trim() ? (
              <HighlightedCode
                autoFollow={latest}
                className={codeBlock}
                code={output.content}
              />
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
    </Frame>
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
