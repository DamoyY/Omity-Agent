import { ChevronRight, type LucideIcon } from "lucide-react";
import { useState, type ReactNode } from "react";
import { sva } from "styled-system/css";

const frame = sva({
  slots: ["root", "summary", "disclosure", "icon", "title"],
  base: {
    root: {
      borderLeftWidth: "2px",
      color: "muted",
      fontSize: "sm",
      maxW: "full",
      mt: "-2",
      minW: 0,
      p: 0,
      w: "full",
      "& pre": { m: 0, maxW: "full" },
    },
    summary: {
      alignItems: "center",
      cursor: "pointer",
      display: "flex",
      gap: "2",
      h: "detailHeader",
      listStyle: "none",
      maxW: "full",
      px: "2",
      _hover: { bg: "controlHover" },
      "&::-webkit-details-marker": { display: "none" },
    },
    disclosure: {
      color: "muted",
      flexShrink: 0,
      transition: "transform 120ms ease",
      "details[open] &": { transform: "rotate(90deg)" },
    },
    icon: { flexShrink: 0 },
    title: {
      color: "mutedStrong",
      flex: "1",
      lineHeight: "normal",
      minW: 0,
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
    },
  },
  variants: {
    tone: {
      model: {
        root: { borderLeftColor: "statusModel" },
        icon: { color: "statusModel" },
      },
      tool: {
        root: { borderLeftColor: "statusTool" },
        icon: { color: "statusTool" },
      },
    },
  },
});

export function Frame({
  accessory,
  children,
  expandedInitially,
  icon: Icon,
  label,
  title,
  tone,
}: {
  accessory?: ReactNode;
  children: ReactNode;
  expandedInitially: boolean;
  icon: LucideIcon;
  label: string;
  title?: ReactNode;
  tone: "model" | "tool";
}) {
  const [expanded, setExpanded] = useState(expandedInitially);
  const classes = frame({ tone });
  return (
    <details
      className={classes.root}
      onToggle={(event) => {
        setExpanded(event.currentTarget.open);
      }}
      open={expanded}
    >
      <summary aria-label={label} className={classes.summary}>
        <ChevronRight className={classes.disclosure} size={12} />
        <Icon className={classes.icon} size={13} />
        {title ? <span className={classes.title}>{title}</span> : null}
        {accessory}
      </summary>
      {expanded ? children : null}
    </details>
  );
}
