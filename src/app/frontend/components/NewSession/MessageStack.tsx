import { Bot, Trash2, UserRound } from "lucide-react";
import { useTranslation } from "react-i18next";
import { css } from "styled-system/css";
import type { InitialMessagePair } from "../../../initialState";
import {
  composerActions,
  composerControls,
  composerFrame,
  composerRole,
} from "../Chat/Composer/layout";
import { MarkdownEditor } from "../Chat/MarkdownEditor";
import { Button } from "../ParkUI";

export interface EditablePair extends InitialMessagePair {
  id: string;
}

const stack = css({ alignSelf: "end" });
export function MessageStack({
  pairs,
  onPairChange,
  onRemove,
  onSubmit,
}: {
  pairs: EditablePair[];
  onPairChange: (id: string, pair: InitialMessagePair) => void;
  onRemove: (id: string) => void;
  onSubmit: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className={stack}>
      {pairs.map((item) => (
        <section key={item.id}>
          <MessageEditor
            label={t("user")}
            role="user"
            value={item.user}
            onChange={(user) => {
              onPairChange(item.id, { ...item, user });
            }}
            onSubmit={onSubmit}
          />
          <MessageEditor
            label={t("assistant")}
            role="assistant"
            value={item.assistant}
            onChange={(assistant) => {
              onPairChange(item.id, { ...item, assistant });
            }}
            onRemove={() => {
              onRemove(item.id);
            }}
            onSubmit={onSubmit}
          />
        </section>
      ))}
    </div>
  );
}

function MessageEditor({
  label,
  role,
  value,
  onChange,
  onRemove,
  onSubmit,
}: {
  label: string;
  role: "user" | "assistant";
  value: string;
  onChange: (value: string) => void;
  onRemove?: () => void;
  onSubmit: () => void;
}) {
  const { t } = useTranslation();
  const RoleIcon = role === "user" ? UserRound : Bot;
  return (
    <div className={composerFrame}>
      <MarkdownEditor
        disabled={false}
        label={label}
        onChange={onChange}
        onSubmit={onSubmit}
        placeholder=""
        value={value}
      />
      <div className={composerActions}>
        <div className={composerControls}>
          {onRemove ? (
            <Button onClick={onRemove} type="button" variant="outline">
              <Trash2 size={14} /> {t("removeMessagePair")}
            </Button>
          ) : null}
        </div>
        <span aria-label={label} className={composerRole} title={label}>
          <RoleIcon aria-hidden size={20} />
        </span>
      </div>
    </div>
  );
}
