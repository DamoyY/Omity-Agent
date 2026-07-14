import { Bot, Trash2, UserRound } from "lucide-react";
import {
  composerActions,
  composerControls,
  composerFrame,
  composerRole,
} from "../Chat/Composer/layout";
import { Button } from "../ParkUI";
import type { InitialMessagePair } from "../../../initialState";
import { MarkdownEditor } from "../Chat/MarkdownEditor";
import { css } from "styled-system/css";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
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
        <MessagePairEditor
          assistantLabel={t("assistant")}
          item={item}
          key={item.id}
          userLabel={t("user")}
          onPairChange={onPairChange}
          onRemove={onRemove}
          onSubmit={onSubmit}
        />
      ))}
    </div>
  );
}
function MessagePairEditor({
  assistantLabel,
  item,
  userLabel,
  onPairChange,
  onRemove,
  onSubmit,
}: {
  assistantLabel: string;
  item: EditablePair;
  userLabel: string;
  onPairChange: (id: string, pair: InitialMessagePair) => void;
  onRemove: (id: string) => void;
  onSubmit: () => void;
}) {
  const changeUser = useCallback(
    (user: string) => {
      onPairChange(item.id, { ...item, user });
    },
    [item, onPairChange],
  );
  const changeAssistant = useCallback(
    (assistant: string) => {
      onPairChange(item.id, { ...item, assistant });
    },
    [item, onPairChange],
  );
  const remove = useCallback(() => {
    onRemove(item.id);
  }, [item.id, onRemove]);
  return (
    <section>
      <MessageEditor
        label={userLabel}
        role="user"
        value={item.user}
        onChange={changeUser}
        onSubmit={onSubmit}
      />
      <MessageEditor
        label={assistantLabel}
        role="assistant"
        value={item.assistant}
        onChange={changeAssistant}
        onRemove={remove}
        onSubmit={onSubmit}
      />
    </section>
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
