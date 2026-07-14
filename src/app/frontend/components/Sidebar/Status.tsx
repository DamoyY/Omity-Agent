import { Bot, Circle, CircleAlert, Pause, Wrench, type LucideIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { css, cva, cx } from "styled-system/css";
import type { SessionStatus } from "../../../../types";
import type { ErrorDetails } from "../../../../failures/details";
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
  tool: { icon: Wrench, label: "statusTool", active: true },
  model: { icon: Bot, label: "statusModel", active: true },
  idle: { icon: Circle, label: "statusIdle" },
  paused: { icon: Pause, label: "statusPaused" },
  error: { icon: CircleAlert, label: "statusError" },
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
