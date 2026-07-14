import { Check, FolderOpen, History } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { css } from "styled-system/css";
import { reportPromiseErrors } from "../../services/errors";
import { Button, Field, Input } from "../ParkUI";
const row = css({
  display: "grid",
  gap: "2",
  gridTemplateColumns: {
    base: "minmax(0, 1fr)",
    sm: "minmax(0, 1fr) auto",
  },
  minW: 0,
});
const pathInput = css({ minW: 0, textOverflow: "ellipsis" });
const recent = css({ display: "grid", gap: "2" });
const recentLabel = css({ color: "muted", fontSize: "xs" });
const recentList = css({ display: "flex", flexWrap: "wrap", gap: "2" });
const recentButton = css({ maxW: "full", minW: 0 });
const recentPath = css({
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});
export function WorkspacePicker({
  recentWorkspaces,
  workspace,
  onChange,
  onPick,
}: {
  recentWorkspaces: string[];
  workspace: string;
  onChange: (workspace: string) => void;
  onPick: () => Promise<string | null>;
}) {
  const { t } = useTranslation();
  const [picking, setPicking] = useState(false);
  const pick = async () => {
    setPicking(true);
    try {
      const selected = await onPick();
      if (selected) onChange(selected);
    } finally {
      setPicking(false);
    }
  };
  return (
    <Field.Root>
      <Field.Label>{t("workspace")}</Field.Label>
      <span className={row}>
        <Input
          className={pathInput}
          value={workspace}
          onChange={(event) => {
            onChange(event.currentTarget.value);
          }}
        />
        <Button
          disabled={picking}
          onClick={() => {
            reportPromiseErrors(pick());
          }}
          type="button"
        >
          <FolderOpen size={14} /> {t("chooseFolder")}
        </Button>
      </span>
      {recentWorkspaces.length > 0 ? (
        <div className={recent}>
          <span className={recentLabel}>{t("recentWorkspaces")}</span>
          <div className={recentList}>
            {recentWorkspaces.map((item) => (
              <Button
                aria-pressed={item === workspace}
                className={recentButton}
                key={item}
                onClick={() => {
                  onChange(item);
                }}
                title={item}
                type="button"
              >
                {item === workspace ? <Check size={14} /> : <History size={14} />}
                <span className={recentPath}>{item}</span>
              </Button>
            ))}
          </div>
        </div>
      ) : null}
    </Field.Root>
  );
}
