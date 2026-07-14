import { Badge, IconButton } from "../ParkUI";
import { CircleStop, LoaderCircle, Wrench } from "lucide-react";
import type { DisplayMessage, DisplayToolCall } from "../../../timeline";
import { type MouseEvent, useCallback, useMemo, useState } from "react";
import { Frame } from "./Frame";
import { HighlightedCode } from "../HighlightedCode";
import { css } from "styled-system/css";
import { formatTokens } from "../../tokenUnits";
import { formatToolInput } from "./toolInput";
import { reportPromiseErrors } from "../../services/errors";
import { useTranslation } from "react-i18next";

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
  minW: 0,
  mt: 0,
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
const accessory = css({ alignItems: "center", display: "flex", gap: "2" });
const stopButton = css({
  borderWidth: "0",
  color: "statusTool",
  h: "6",
  minW: "6",
  p: 0,
});
export function ToolCall({
  call,
  latest,
  onCancel,
  output,
  started,
}: {
  call: DisplayToolCall;
  latest: boolean;
  onCancel: (toolCallId: string) => Promise<void>;
  output?: DisplayMessage;
  started?: boolean;
}) {
  const { t } = useTranslation();
  const [cancelling, setCancelling] = useState(false);
  const running = started && output === undefined;
  const showOutput = output !== undefined || started;
  const showOutputCode = output
    ? output.content.trim().length > 0 || output.images.length === 0
    : started;
  const handleCancel = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.stopPropagation();
      setCancelling(true);
      const cancel = async () => {
        try {
          await onCancel(call.id);
        } catch (error: unknown) {
          setCancelling(false);
          throw error;
        }
      };
      reportPromiseErrors(cancel());
    },
    [call.id, onCancel],
  );
  const frameAccessory = useMemo(
    () =>
      call.streaming || running ? (
        <span className={accessory}>
          {call.streaming ? <Badge>{t("streaming")}</Badge> : null}
          {running ? (
            <IconButton
              aria-label={t("stopTool")}
              className={stopButton}
              disabled={cancelling}
              onClick={handleCancel}
              title={t("stopTool")}
              type="button"
              variant="ghost"
            >
              {cancelling ? (
                <LoaderCircle aria-hidden size={14} />
              ) : (
                <CircleStop aria-hidden size={14} />
              )}
            </IconButton>
          ) : null}
        </span>
      ) : undefined,
    [call.streaming, cancelling, handleCancel, running, t],
  );
  return (
    <Frame
      accessory={frameAccessory}
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
            language={call.rawInput === undefined ? "yaml" : "plaintext"}
          />
        </section>
        {showOutput ? (
          <section className={ioPanel}>
            <p className={panelTitle}>
              <span>{t("output")}</span>
              <span className={tokenCount}>
                {output ? formatTokens(output.outputTokens ?? 0) : t("unavailableTokens")}
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
