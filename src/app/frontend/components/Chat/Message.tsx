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

const message = css({
  bg: "surface",
  borderColor: "line",
  borderWidth: "1px",
  display: "grid",
  gap: "3",
  justifyItems: "start",
  maxW: "52rem",
  minW: 0,
  p: "4",
  textAlign: "left",
  w: "fit-content",
});

const userMessage = css({
  bg: "surfaceRaised",
  borderColor: "lineStrong",
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
  w: "full",
});

const actions = css({ alignItems: "center", display: "flex", gap: "1" });

export function Message({
  canFork,
  forkDisabled,
  item,
  onFork,
}: {
  canFork: boolean;
  forkDisabled: boolean;
  item: TimelineMessage;
  onFork: (messageId: number) => Promise<void>;
}) {
  const { t } = useTranslation();
  const tone = roleTone({ role: item.role });
  return (
    <div className={cx(row, item.role === "user" && userRow)}>
      <article className={cx(message, item.role === "user" && userMessage)}>
        <div className={header}>
          <span className={actions}>
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
              />
            );
          if (part.type === "reasoning")
            return (
              <Reasoning
                content={part.content}
                key={`reasoning-${index.toString()}`}
              />
            );
          return (
            <ToolCall
              call={part.call}
              key={part.call.id}
              output={part.output}
            />
          );
        })}
      </article>
    </div>
  );
}
