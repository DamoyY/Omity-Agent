import { Send } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { css } from "styled-system/css";
import type { InitialSessionState } from "../../../initialState";
import { reportPromiseErrors } from "../../services/errors";
import { Button } from "../ParkUI";
import { MessageStack, type EditablePair } from "./MessageStack";
import { WorkspacePicker } from "./WorkspacePicker";

const scroll = css({ h: "full", minH: 0, overflowY: "auto" });
const form = css({
  alignContent: "start",
  display: "grid",
  gap: "6",
  gridTemplateRows: "auto auto minmax(min-content, 1fr)",
  maxW: "content",
  minH: "full",
  mx: "auto",
  p: { base: "4", md: "8" },
  w: "full",
});
const conversation = css({ alignSelf: "end", display: "grid", gap: "6" });
const header = css({
  borderBottomColor: "line",
  borderBottomWidth: "1px",
  display: "grid",
  gap: "2",
  pb: "5",
});
const eyebrow = css({
  color: "muted",
  fontSize: "xs",
  letterSpacing: "0.12em",
  textTransform: "uppercase",
});
const title = css({
  color: "text",
  fontSize: "2xl",
  fontWeight: "normal",
  m: 0,
});
const description = css({
  color: "muted",
  fontSize: "sm",
  m: 0,
  maxW: "42rem",
});
const actions = css({
  alignItems: "center",
  borderTopColor: "line",
  borderTopWidth: "1px",
  display: "flex",
  justifyContent: "flex-end",
  pt: "5",
});

export function NewSessionPage({
  pageClassName,
  recentWorkspaces,
  workspace,
  onCreate,
  onPickWorkspace,
  onWorkspaceChange,
}: {
  pageClassName: string;
  recentWorkspaces: string[];
  workspace: string;
  onCreate: (state: InitialSessionState) => Promise<void>;
  onPickWorkspace: () => Promise<string | null>;
  onWorkspaceChange: (workspace: string) => void;
}) {
  const { t } = useTranslation();
  const [message, setMessage] = useState("");
  const [pairs, setPairs] = useState<EditablePair[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const complete =
    workspace.trim().length > 0 &&
    message.trim().length > 0 &&
    pairs.every(
      ({ user, assistant }) =>
        user.trim().length > 0 && assistant.trim().length > 0,
    );
  const submit = async () => {
    if (!complete || submitting) return;
    setSubmitting(true);
    try {
      await onCreate({
        history: pairs.map(({ user, assistant }) => ({ user, assistant })),
        message,
      });
    } finally {
      setSubmitting(false);
    }
  };
  return (
    <div className={pageClassName}>
      <div className={scroll}>
        <form
          className={form}
          onSubmit={(event) => {
            event.preventDefault();
            reportPromiseErrors(submit());
          }}
        >
          <header className={header}>
            <span className={eyebrow}>{t("initialState")}</span>
            <h1 className={title}>{t("newSession")}</h1>
            <p className={description}>{t("initialStateDescription")}</p>
          </header>
          <WorkspacePicker
            recentWorkspaces={recentWorkspaces}
            workspace={workspace}
            onChange={onWorkspaceChange}
            onPick={onPickWorkspace}
          />
          <div className={conversation}>
            <MessageStack
              message={message}
              pairs={pairs}
              onAdd={() => {
                setPairs((current) => [
                  ...current,
                  { id: crypto.randomUUID(), user: "", assistant: "" },
                ]);
              }}
              onMessageChange={setMessage}
              onPairChange={(id, next) => {
                setPairs((current) =>
                  current.map((item) =>
                    item.id === id ? { id, ...next } : item,
                  ),
                );
              }}
              onRemove={(id) => {
                setPairs((current) => current.filter((item) => item.id !== id));
              }}
              onSubmit={() => {
                reportPromiseErrors(submit());
              }}
            />
            <div className={actions}>
              <Button disabled={!complete || submitting} type="submit">
                <Send size={14} />{" "}
                {submitting ? t("creating") : t("createAndSend")}
              </Button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
