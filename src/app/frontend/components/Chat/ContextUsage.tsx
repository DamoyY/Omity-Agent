import { DatabaseZap } from "lucide-react";
import type { TokenUsage } from "../../../timeline";
import { css } from "styled-system/css";
import { formatTokens } from "../../tokenUnits";
import { useTranslation } from "react-i18next";

const panel = css({
  alignItems: "end",
  borderTopColor: "line",
  borderTopWidth: "1px",
  color: "muted",
  display: "grid",
  fontFamily: "mono",
  fontSize: "xs",
  gap: "2",
  justifyItems: "end",
  mt: "auto",
  pt: "3",
  w: "full",
  whiteSpace: "nowrap",
});
const row = css({
  alignItems: "center",
  display: "flex",
  gap: "1.5",
});
const value = css({ color: "mutedStrong" });
export function ContextUsage({ usage }: { usage: TokenUsage | null }) {
  const { t } = useTranslation();
  const totalTokens = usage
    ? formatTokens(usage.inputTokens + usage.outputTokens)
    : t("unavailableTokens");
  const cacheRate =
    usage && usage.inputTokens > 0
      ? `${((usage.cacheReadTokens / usage.inputTokens) * 100).toFixed(2)}%`
      : (usage
        ? "0.00%"
        : "—");
  const description = `${t("contextUsage")}: ${totalTokens}; ${t("kvCache")}: ${cacheRate}`;
  return (
    <div aria-label={description} className={panel} title={description}>
      <span className={row}>
        <span>{t("contextUsage")}</span>
        <span className={value}>{totalTokens}</span>
      </span>
      <span className={row}>
        <DatabaseZap aria-hidden="true" size={12} />
        <span>{t("kvCache")}</span>
        <span className={value}>{cacheRate}</span>
      </span>
    </div>
  );
}
