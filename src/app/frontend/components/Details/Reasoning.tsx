import { BrainCircuit } from "lucide-react";
import { useTranslation } from "react-i18next";
import { css } from "styled-system/css";
import { MarkdownView } from "../MarkdownView";
import { Frame } from "./Frame";
const content = css({
  borderTopColor: "line",
  borderTopWidth: "1px",
  m: "3",
  mt: 0,
  minW: 0,
  pt: "3",
});
export function Reasoning({
  content: reasoning,
  latest,
}: {
  content: string;
  latest: boolean;
}) {
  const { t } = useTranslation();
  return (
    <Frame
      expandedInitially={latest}
      icon={BrainCircuit}
      label={t("reasoning")}
      title={t("reasoning")}
      tone="model"
    >
      <div className={content}>
        <MarkdownView content={reasoning} />
      </div>
    </Frame>
  );
}
