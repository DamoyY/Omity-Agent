import { Bot, Circle, CircleAlert, type LucideIcon, Pause, Wrench } from "lucide-react";
import { css, cva, cx } from "styled-system/css";
import type { ErrorDetails } from "../../../../failures/details";
import type { SessionStatus } from "../../../../types";
import { useTranslation } from "react-i18next";

const indicator = cva({
  base: {
    alignItems: "center",
    display: "inline-flex",
    flexShrink: 0,
    fontSize: "xs",
    gap: "1.5",
  },
  variants: {
    status: {
      error: { color: "statusError" },
      idle: { color: "statusIdle" },
      model: { color: "statusModel" },
      paused: { color: "statusPaused" },
      tool: { color: "statusTool" },
    },
  },
});
const activeIcon = css({ animation: "pulse 1.8s ease-in-out infinite" });
const statusMeta: Record<SessionStatus, { icon: LucideIcon; label: string; active?: boolean }> = {
  error: { icon: CircleAlert, label: "statusError" },
  idle: { icon: Circle, label: "statusIdle" },
  model: { active: true, icon: Bot, label: "statusModel" },
  paused: { icon: Pause, label: "statusPaused" },
  tool: { active: true, icon: Wrench, label: "statusTool" },
};
export function Status({
  compact = false,
  error,
  status,
}: {
  compact?: boolean;
  error: ErrorDetails | null;
  status: SessionStatus;
}) {
  const { t } = useTranslation();
  const meta = statusMeta[status];
  const Icon = meta.icon;
  const label = t(meta.label);
  const description = status === "error" && error ? `${label}: ${error.message}` : label;
  return (
    <span
      aria-label={description}
      className={indicator({ status })}
      title={status === "error" && error ? error.message : label}
    >
      <Icon
        aria-hidden="true"
        className={cx(meta.active && activeIcon)}
        size={12}
        strokeWidth={2}
      />
      {!compact && <span>{label}</span>}
    </span>
  );
}
