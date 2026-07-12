import { Bot, Plus, Trash2, UserRound } from "lucide-react";
import { useTranslation } from "react-i18next";
import { css } from "styled-system/css";
import type { InitialMessagePair } from "../../../initialState";
import { MarkdownEditor } from "../Chat/MarkdownEditor";
import { Button } from "../ParkUI";

export interface EditablePair extends InitialMessagePair {
  id: string;
}

const stream = css({
  bg: "surface",
  borderBottomColor: "lineStrong",
  borderBottomWidth: "1px",
});
const pair = css({
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) 3rem",
  minW: 0,
});
const pairMessages = css({ minW: 0 });
const pairAction = css({
  borderLeftColor: "lineStrong",
  borderLeftWidth: "1px",
  borderTopColor: "lineStrong",
  borderTopWidth: "1px",
  display: "grid",
  placeItems: "center",
});
const row = css({
  borderTopColor: "lineStrong",
  borderTopWidth: "1px",
  display: "grid",
  gridTemplateColumns: {
    base: "3rem minmax(0, 1fr)",
    md: "3rem minmax(0, 1fr)",
  },
  minW: 0,
});
const meta = css({
  alignItems: "center",
  borderRightColor: "lineStrong",
  borderRightWidth: "1px",
  display: "flex",
  justifyContent: "center",
  minH: "10",
});
const role = css({
  color: "mutedStrong",
  display: "grid",
  placeItems: "center",
});
const remove = css({
  bg: "control",
  borderColor: "lineStrong",
  borderWidth: "1px",
  color: "mutedStrong",
  cursor: "pointer",
  display: "grid",
  p: "1",
  placeItems: "center",
  _hover: { color: "text" },
  _focusVisible: { outlineColor: "mutedStrong", outlineStyle: "solid" },
});
const insertion = css({
  alignItems: "center",
  borderTopColor: "lineStrong",
  borderTopWidth: "1px",
  display: "flex",
  justifyContent: "center",
  py: "3",
});

export function MessageStack({
  message,
  pairs,
  onAdd,
  onMessageChange,
  onPairChange,
  onRemove,
  onSubmit,
}: {
  message: string;
  pairs: EditablePair[];
  onAdd: () => void;
  onMessageChange: (message: string) => void;
  onPairChange: (id: string, pair: InitialMessagePair) => void;
  onRemove: (id: string) => void;
  onSubmit: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className={stream}>
      {pairs.map((item) => {
        return (
          <section className={pair} key={item.id}>
            <div className={pairMessages}>
              <MessageRow
                label={t("user")}
                role="user"
                value={item.user}
                placeholder=""
                onChange={(user) => {
                  onPairChange(item.id, { ...item, user });
                }}
                onSubmit={onSubmit}
              />
              <MessageRow
                label={t("assistant")}
                role="assistant"
                value={item.assistant}
                placeholder=""
                onChange={(assistant) => {
                  onPairChange(item.id, { ...item, assistant });
                }}
                onSubmit={onSubmit}
              />
            </div>
            <div className={pairAction}>
              <button
                aria-label={t("removeMessagePair")}
                className={remove}
                onClick={() => {
                  onRemove(item.id);
                }}
                title={t("removeMessagePair")}
                type="button"
              >
                <Trash2 size={14} />
              </button>
            </div>
          </section>
        );
      })}
      <div className={insertion}>
        <Button onClick={onAdd} type="button" variant="ghost">
          <Plus size={14} /> {t("addMessagePair")}
        </Button>
      </div>
      <MessageRow
        label={t("user")}
        role="user"
        value={message}
        placeholder={t("messagePlaceholder")}
        onChange={onMessageChange}
        onSubmit={onSubmit}
      />
    </div>
  );
}

function MessageRow({
  label,
  role: messageRole,
  value,
  placeholder,
  onChange,
  onSubmit,
}: {
  label: string;
  role: "user" | "assistant";
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
}) {
  const RoleIcon = messageRole === "user" ? UserRound : Bot;
  return (
    <section className={row}>
      <div className={meta}>
        <span aria-label={label} className={role} title={label}>
          <RoleIcon aria-hidden size={15} />
        </span>
      </div>
      <MarkdownEditor
        bare
        disabled={false}
        fluid
        label={label}
        onChange={onChange}
        onSubmit={onSubmit}
        placeholder={placeholder}
        value={value}
      />
    </section>
  );
}
