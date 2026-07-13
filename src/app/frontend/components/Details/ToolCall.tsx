import { Wrench } from "lucide-react";
import { useTranslation } from "react-i18next";
import { css } from "styled-system/css";
import type { DisplayMessage, DisplayToolCall } from "../../../timeline";
import { formatTokens } from "../../tokenUnits";
import { HighlightedCode } from "../HighlightedCode";
import { Badge } from "../ParkUI";
import { Frame } from "./Frame";
import { formatToolInput } from "./toolInput";
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
const panelTitle = css({
  alignItems: "center",
  color: "mutedStrong",
  display: "flex",
  fontSize: "xs",
  justifyContent: "space-between",
  m: 0,
});
const tokenCount = css({ color: "muted", fontFamily: "mono" });
const codeBlock = css({
  maxH: "toolOutput",
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
  started,
}: {
  call: DisplayToolCall;
  latest: boolean;
  output?: DisplayMessage;
  started?: boolean;
}) {
  const { t } = useTranslation();
  const showOutput = output !== undefined || started;
  const showOutputCode = output
    ? output.content.trim().length > 0 || output.images.length === 0
    : started;
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
          <p className={panelTitle}>
            <span>{t("input")}</span>
            <span className={tokenCount}>{formatTokens(call.inputTokens)}</span>
          </p>
          <HighlightedCode
            autoFollow={latest}
            className={codeBlock}
            code={formatToolInput(call)}
            language="yaml"
          />
        </section>
        {showOutput ? (
          <section className={ioPanel}>
            <p className={panelTitle}>
              <span>{t("output")}</span>
              <span className={tokenCount}>
                {output
                  ? formatTokens(output.outputTokens ?? 0)
                  : t("unavailableTokens")}
              </span>
            </p>
            {showOutputCode ? (
              <HighlightedCode
                autoFollow={latest}
                className={codeBlock}
                code={output?.content ?? ""}
              />
            ) : null}
            {output && output.images.length > 0 ? (
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
