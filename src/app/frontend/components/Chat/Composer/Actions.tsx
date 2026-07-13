import { Pause, Play, Send } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { TokenUsage } from "../../../../timeline";
import { Button } from "../../ParkUI";
import { reportPromiseErrors } from "../../../services/errors";
import { ContextUsage } from "../ContextUsage";
import { DeleteSessionButton } from "../DeleteSessionButton";
import { composerActions, composerControls } from "./layout";

type ControlState = "pause" | "pausing" | "resume";

export function Actions({
  controlDisabled,
  controlState,
  deleteDisabled,
  submitDisabled,
  usage,
  onControl,
  onDelete,
}: {
  controlDisabled: boolean;
  controlState?: ControlState;
  deleteDisabled: boolean;
  submitDisabled: boolean;
  usage?: TokenUsage | null;
  onControl?: () => Promise<void>;
  onDelete?: () => Promise<void>;
}) {
  const { t } = useTranslation();
  return (
    <div className={composerActions}>
      <div className={composerControls}>
        <Button disabled={submitDisabled} type="submit" variant="outline">
          <Send size={14} /> {t("send")}
        </Button>
        {controlState && onControl ? (
          <Button
            disabled={controlDisabled}
            onClick={() => {
              reportPromiseErrors(onControl());
            }}
            type="button"
            variant="outline"
          >
            {controlState === "resume" ? (
              <Play size={14} />
            ) : (
              <Pause size={14} />
            )}
            {t(controlState)}
          </Button>
        ) : null}
        {onDelete ? (
          <DeleteSessionButton disabled={deleteDisabled} onDelete={onDelete} />
        ) : null}
      </div>
      {usage !== undefined ? <ContextUsage usage={usage} /> : null}
    </div>
  );
}
