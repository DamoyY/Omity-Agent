import { ChevronRight, type LucideIcon } from "lucide-react";
import { type ReactNode, type SyntheticEvent, useCallback, useState } from "react";
import { sva } from "styled-system/css";

const frame = sva({
  base: {
    disclosure: {
      color: "muted",
      "details[open] &": { transform: "rotate(90deg)" },
      flexShrink: 0,
      transition: "transform 120ms ease",
    },
    icon: { flexShrink: 0 },
    root: {
      "& pre": { m: 0, maxW: "full" },
      borderLeftWidth: "2px",
      color: "muted",
      fontSize: "sm",
      maxW: "full",
      minW: 0,
      mt: "-2",
      p: 0,
      w: "full",
    },
    summary: {
      "&::-webkit-details-marker": { display: "none" },
      _hover: { bg: "controlHover" },
      alignItems: "center",
      cursor: "pointer",
      display: "flex",
      gap: "2",
      h: "detailHeader",
      listStyle: "none",
      maxW: "full",
      px: "2",
    },
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
  slots: ["root", "summary", "disclosure", "icon", "title"],
  variants: {
    tone: {
      model: {
        icon: { color: "statusModel" },
        root: { borderLeftColor: "statusModel" },
      },
      tool: {
        icon: { color: "statusTool" },
        root: { borderLeftColor: "statusTool" },
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
  const handleToggle = useCallback((event: SyntheticEvent<HTMLDetailsElement>) => {
    setExpanded(event.currentTarget.open);
  }, []);
  return (
    <details className={classes.root} onToggle={handleToggle} open={expanded}>
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
