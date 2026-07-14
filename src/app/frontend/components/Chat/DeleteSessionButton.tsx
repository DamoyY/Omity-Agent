import { useEffect, useState } from "react";
import { Button } from "../ParkUI";
import { Trash2 } from "lucide-react";
import { css } from "styled-system/css";
import { reportPromiseErrors } from "../../services/errors";
import { useTranslation } from "react-i18next";
const armed = css({
  _hover: { bg: "statusError", color: "canvas" },
  bg: "statusError",
  color: "canvas",
});
export function DeleteSessionButton({
  disabled,
  onDelete,
}: {
  disabled: boolean;
  onDelete: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const [confirming, setConfirming] = useState(false);
  useEffect(() => {
    if (!confirming) {
      return;
    }
    const timeout = window.setTimeout(() => {
      setConfirming(false);
    }, 2000);
    return () => {
      window.clearTimeout(timeout);
    };
  }, [confirming]);
  return (
    <Button
      className={confirming ? armed : undefined}
      disabled={disabled}
      onClick={() => {
        if (!confirming) {
          setConfirming(true);
          return;
        }
        setConfirming(false);
        reportPromiseErrors(onDelete());
      }}
      title={disabled ? t("runningDeleteDisabled") : undefined}
      type="button"
      variant="ghost"
    >
      <Trash2 size={14} />
      {t(confirming ? "confirmDelete" : "deleteSession")}
    </Button>
  );
}
