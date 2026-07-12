import { GitFork } from "lucide-react";
import { useTranslation } from "react-i18next";
import { css, cva, cx } from "styled-system/css";
import type { TimelineMessage } from "../../../timeline";
import { reportPromiseErrors } from "../../services/errors";
import { Reasoning } from "../Details/Reasoning";
import { ToolCall } from "../Details/ToolCall";
import { MarkdownView } from "../MarkdownView";
import { IconButton } from "../ParkUI";
import { CopyButton } from "./CopyButton";

const row = css({
  alignItems: "start",
  display: "flex",
  gap: "2",
  mb: "4",
  minW: 0,
  w: "full",
});

const userRow = css({ justifyContent: "flex-end" });

const forkButton = css({
  borderWidth: "0",
  flexShrink: 0,
});

const message = cva({
  base: {
    bg: "surface",
    borderColor: "line",
    borderWidth: "1px",
    display: "grid",
    gap: "3",
    justifyItems: "start",
    maxW: "content",
    minW: 0,
    p: "4",
    textAlign: "left",
    w: "fit-content",
  },
  variants: {
    role: {
      assistant: {},
      tool: {},
      user: {
        bg: "surfaceRaised",
        borderColor: "lineStrong",
      },
    },
  },
});

const roleTone = cva({
  variants: {
    role: {
      assistant: { color: "statusModel" },
      tool: { color: "statusTool" },
      user: { color: "statusPaused" },
    },
  },
});

const header = css({
  alignItems: "center",
  display: "flex",
  justifyContent: "flex-end",
  minH: "8",
  pointerEvents: "none",
  position: "sticky",
  top: "0",
  w: "full",
  zIndex: "1",
});

const actions = cva({
  base: {
    alignItems: "center",
    display: "flex",
    gap: "1",
    pointerEvents: "auto",
  },
  variants: {
    role: {
      assistant: { bg: "surface" },
      tool: { bg: "surface" },
      user: { bg: "surfaceRaised" },
    },
  },
});

export function Message({
  canFork,
  forkDisabled,
  item,
  latestDetailIndex,
  onFork,
}: {
  canFork: boolean;
  forkDisabled: boolean;
  item: TimelineMessage;
  latestDetailIndex?: number;
  onFork: (messageId: number) => Promise<void>;
}) {
  const { t } = useTranslation();
  const tone = roleTone({ role: item.role });
  return (
    <div className={cx(row, item.role === "user" && userRow)}>
      <article className={message({ role: item.role })}>
        <div className={header}>
          <span className={actions({ role: item.role })}>
            {canFork ? (
              <IconButton
                aria-label={t("fork")}
                className={cx(forkButton, tone)}
                disabled={forkDisabled}
                onClick={() => {
                  reportPromiseErrors(onFork(item.id));
                }}
                title={t("fork")}
                type="button"
                variant="ghost"
              >
                <GitFork size={14} />
              </IconButton>
            ) : null}
            {item.role === "user" || item.role === "assistant" ? (
              <CopyButton className={tone} value={item.content} />
            ) : null}
          </span>
        </div>
        {item.parts.map((part, index) => {
          if (part.type === "content")
            return (
              <MarkdownView
                content={part.content}
                key={`content-${index.toString()}`}
                preserveLineBreaks={item.role === "user"}
              />
            );
          if (part.type === "reasoning")
            return (
              <Reasoning
                content={part.content}
                key={`reasoning-${index.toString()}-${index === latestDetailIndex ? "latest" : "settled"}`}
                latest={index === latestDetailIndex}
              />
            );
          return (
            <ToolCall
              call={part.call}
              key={`${part.call.id}-${index === latestDetailIndex ? "latest" : "settled"}`}
              latest={index === latestDetailIndex}
              output={part.output}
              started={part.started}
            />
          );
        })}
      </article>
    </div>
  );
}
