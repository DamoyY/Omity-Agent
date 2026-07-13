import { Send, UserRound } from "lucide-react";
import { useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { css } from "styled-system/css";
import type { InitialSessionState } from "../../../initialState";
import { reportPromiseErrors } from "../../services/errors";
import {
  composerActions,
  composerControls,
  composerFrame,
  composerRole,
} from "../Chat/ComposerFrame";
import { MarkdownEditor } from "../Chat/MarkdownEditor";
import { Button } from "../ParkUI";
import { MessageStack, type EditablePair } from "./MessageStack";
import { WorkspacePicker } from "./WorkspacePicker";

const scroll = css({ minH: 0, overflowY: "auto" });
const scrollContent = css({
  display: "grid",
  gridTemplateRows: "auto minmax(min-content, 1fr)",
  minH: "full",
});
const setup = css({
  alignContent: "start",
  display: "grid",
  gap: "6",
  maxW: "content",
  minH: "full",
  mx: "auto",
  p: { base: "4", md: "8" },
  w: "full",
});
const messageFlow = css({ alignSelf: "end" });

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
  const scrollRef = useRef<HTMLDivElement>(null);
  const previousPairCountRef = useRef(pairs.length);
  useLayoutEffect(() => {
    const pairAdded = pairs.length > previousPairCountRef.current;
    previousPairCountRef.current = pairs.length;
    if (!pairAdded) return;
    const keepLastMessageInPlace = () => {
      const node = scrollRef.current;
      if (node) node.scrollTop = node.scrollHeight;
    };
    keepLastMessageInPlace();
    const frame = requestAnimationFrame(keepLastMessageInPlace);
    return () => {
      cancelAnimationFrame(frame);
    };
  }, [pairs.length]);
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
    <form
      className={pageClassName}
      onSubmit={(event) => {
        event.preventDefault();
        reportPromiseErrors(submit());
      }}
    >
      <div className={scroll} ref={scrollRef}>
        <div className={scrollContent}>
          <div className={setup}>
            <WorkspacePicker
              recentWorkspaces={recentWorkspaces}
              workspace={workspace}
              onChange={onWorkspaceChange}
              onPick={onPickWorkspace}
            />
          </div>
          <div className={messageFlow}>
            <MessageStack
              pairs={pairs}
              onAdd={() => {
                setPairs((current) => [
                  ...current,
                  { id: crypto.randomUUID(), user: "", assistant: "" },
                ]);
              }}
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
            <div className={composerFrame}>
              <MarkdownEditor
                disabled={submitting}
                onChange={setMessage}
                onSubmit={() => {
                  reportPromiseErrors(submit());
                }}
                placeholder={t("messagePlaceholder")}
                value={message}
              />
              <div className={composerActions}>
                <div className={composerControls}>
                  <span
                    aria-label={t("user")}
                    className={composerRole}
                    title={t("user")}
                  >
                    <UserRound aria-hidden size={20} />
                  </span>
                  <Button
                    disabled={!complete || submitting}
                    type="submit"
                    variant="outline"
                  >
                    <Send size={14} />
                    {submitting ? t("creating") : t("createAndSend")}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </form>
  );
}
