import { Button, Field, Input } from "../ParkUI";
import { type ChangeEvent, useCallback, useState } from "react";
import { Check, FolderOpen, History } from "lucide-react";
import { css } from "styled-system/css";
import { reportPromiseErrors } from "../../services/errors";
import { useTranslation } from "react-i18next";

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
async function pickWorkspace(
  onPick: () => Promise<string | null>,
  onChange: (workspace: string) => void,
  setPicking: (picking: boolean) => void,
) {
  setPicking(true);
  try {
    const selected = await onPick();
    if (selected) {
      onChange(selected);
    }
  } finally {
    setPicking(false);
  }
}
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
  const handlePick = useCallback(() => {
    reportPromiseErrors(pickWorkspace(onPick, onChange, setPicking));
  }, [onChange, onPick]);
  const handleInputChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      onChange(event.currentTarget.value);
    },
    [onChange],
  );
  return (
    <Field.Root>
      <Field.Label>{t("workspace")}</Field.Label>
      <span className={row}>
        <Input className={pathInput} value={workspace} onChange={handleInputChange} />
        <Button disabled={picking} onClick={handlePick} type="button">
          <FolderOpen size={14} /> {t("chooseFolder")}
        </Button>
      </span>
      {recentWorkspaces.length > 0 ? (
        <div className={recent}>
          <span className={recentLabel}>{t("recentWorkspaces")}</span>
          <div className={recentList}>
            {recentWorkspaces.map((item) => (
              <RecentWorkspaceButton
                item={item}
                key={item}
                selected={item === workspace}
                onChange={onChange}
              />
            ))}
          </div>
        </div>
      ) : null}
    </Field.Root>
  );
}
function RecentWorkspaceButton({
  item,
  selected,
  onChange,
}: {
  item: string;
  selected: boolean;
  onChange: (workspace: string) => void;
}) {
  const select = useCallback(() => {
    onChange(item);
  }, [item, onChange]);
  return (
    <Button
      aria-pressed={selected}
      className={recentButton}
      onClick={select}
      title={item}
      type="button"
    >
      {selected ? <Check size={14} /> : <History size={14} />}
      <span className={recentPath}>{item}</span>
    </Button>
  );
}
