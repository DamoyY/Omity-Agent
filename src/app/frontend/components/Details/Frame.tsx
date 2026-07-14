import { ChevronRight, type LucideIcon } from "lucide-react";
import { type ReactNode, useCallback, useState } from "react";
import { sva } from "styled-system/css";

const frame = sva({
  base: {
    accessory: { alignItems: "center", display: "flex", flexShrink: 0 },
    disclosure: {
      'button[aria-expanded="true"] &': { transform: "rotate(90deg)" },
      color: "muted",
      flexShrink: 0,
      transition: "transform 120ms ease",
    },
    header: {
      _hover: { bg: "controlHover" },
      alignItems: "center",
      display: "flex",
      h: "detailHeader",
      maxW: "full",
      px: "2",
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
    title: {
      color: "mutedStrong",
      flex: "1",
      lineHeight: "normal",
      minW: 0,
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
    },
    trigger: {
      alignItems: "center",
      appearance: "none",
      bg: "transparent",
      borderWidth: 0,
      color: "inherit",
      cursor: "pointer",
      display: "flex",
      flex: "1",
      font: "inherit",
      gap: "2",
      h: "full",
      maxW: "full",
      minW: 0,
      p: 0,
      textAlign: "left",
    },
  },
  slots: ["root", "header", "trigger", "disclosure", "icon", "title", "accessory"],
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
  const handleToggle = useCallback(() => {
    setExpanded((current) => !current);
  }, []);
  return (
    <div className={classes.root}>
      <div className={classes.header}>
        <button
          aria-expanded={expanded}
          aria-label={label}
          className={classes.trigger}
          onClick={handleToggle}
          type="button"
        >
          <ChevronRight className={classes.disclosure} size={12} />
          <Icon className={classes.icon} size={13} />
          {title ? <span className={classes.title}>{title}</span> : null}
        </button>
        {accessory ? <div className={classes.accessory}>{accessory}</div> : null}
      </div>
      {expanded ? children : null}
    </div>
  );
}
