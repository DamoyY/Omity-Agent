import { DatabaseZap } from "lucide-react";
import { useTranslation } from "react-i18next";
import { css } from "styled-system/css";
import type { TokenUsage } from "../../../timeline";

const panel = css({
  alignItems: "end",
  color: "muted",
  display: "grid",
  fontFamily: "mono",
  fontSize: "xs",
  gap: "2",
  justifyItems: "end",
  mt: "auto",
  pt: "3",
  borderTopColor: "line",
  borderTopWidth: "1px",
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
      ? `${Math.round((usage.cacheReadTokens / usage.inputTokens) * 100).toString()}%`
      : usage
        ? "0%"
        : "—";
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

export function formatTokens(tokens: number) {
  if (tokens <= 1000) return `${tokens.toString()} Tokens`;
  const precision = tokens < 10_000 ? 1 : 0;
  const compact = (tokens / 1000).toFixed(precision).replace(/\.0$/, "");
  return `${compact}K Tokens`;
}
