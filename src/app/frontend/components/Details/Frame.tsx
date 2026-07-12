import { ChevronRight, type LucideIcon } from "lucide-react";
import { useState, type ReactNode } from "react";
import { css, cva } from "styled-system/css";

const details = cva({
  base: {
    bg: "surfaceRaised",
    borderLeftWidth: "3px",
    color: "muted",
    fontSize: "sm",
    maxW: "full",
    mt: "2",
    minW: 0,
    p: 0,
    w: "full",
    "& pre": { m: 0, maxW: "full" },
  },
  variants: {
    tone: {
      model: { borderLeftColor: "statusModel" },
      tool: { borderLeftColor: "statusTool" },
    },
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
const iconTone = cva({
  base: { flexShrink: 0 },
  variants: {
    tone: { model: { color: "statusModel" }, tool: { color: "statusTool" } },
  },
});
const summaryText = css({
  color: "mutedStrong",
  flex: "1",
  lineHeight: "1",
  minW: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

export function Frame({
  accessory,
  children,
  icon: Icon,
  title,
  tone,
}: {
  accessory?: ReactNode;
  children: ReactNode;
  icon: LucideIcon;
  title: ReactNode;
  tone: "model" | "tool";
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <details
      className={details({ tone })}
      onToggle={(event) => {
        setExpanded(event.currentTarget.open);
      }}
    >
      <summary className={summary}>
        <ChevronRight className={disclosure} size={14} />
        <Icon className={iconTone({ tone })} size={14} />
        <span className={summaryText}>{title}</span>
        {accessory}
      </summary>
      {expanded ? children : null}
    </details>
  );
}
