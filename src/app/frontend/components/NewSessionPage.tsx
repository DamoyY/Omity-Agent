import { Check, FolderOpen, History } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { css } from "styled-system/css";
import { Composer } from "./Chat/Composer";
import { Button, Field, Input } from "./ParkUI";
import { reportPromiseErrors } from "../services/errors";

const content = css({
  alignContent: "start",
  display: "grid",
  gap: "4",
  minH: 0,
  overflowY: "auto",
  p: "6",
});

const form = css({
  display: "grid",
  gap: "3",
  maxW: "52rem",
  w: "full",
});

const title = css({
  color: "mutedStrong",
  fontSize: "md",
  fontWeight: "normal",
  m: 0,
});

const workspaceRow = css({
  display: "grid",
  gap: "2",
  gridTemplateColumns: "minmax(0, 1fr) auto",
  minW: 0,
});

const pathInput = css({
  minW: 0,
  textOverflow: "ellipsis",
});

const recent = css({
  display: "grid",
  gap: "2",
});

const recentLabel = css({
  color: "muted",
  fontSize: "xs",
});

const recentList = css({
  display: "flex",
  flexWrap: "wrap",
  gap: "2",
  minW: 0,
});

const recentButton = css({
  maxW: "full",
  minW: 0,
});

const recentPath = css({
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

export function NewSessionPage({
  pageClassName,
  recentWorkspaces,
  workspace,
  onPickWorkspace,
  onSend,
  onWorkspaceChange,
}: {
  pageClassName: string;
  recentWorkspaces: string[];
  workspace: string;
  onPickWorkspace: () => Promise<string | null>;
  onSend: (content: string, draftRevision: number) => Promise<void>;
  onWorkspaceChange: (workspace: string) => void;
}) {
  const { t } = useTranslation();
  const [picking, setPicking] = useState(false);
  const pickWorkspace = async () => {
    setPicking(true);
    try {
      const selected = await onPickWorkspace();
      if (selected) onWorkspaceChange(selected);
    } finally {
      setPicking(false);
    }
  };
  return (
    <div className={pageClassName}>
      <section className={content}>
        <div className={form}>
          <h1 className={title}>{t("newSession")}</h1>
          <Field.Root>
            <Field.Label>{t("workspace")}</Field.Label>
            <span className={workspaceRow}>
              <Input
                className={pathInput}
                value={workspace}
                onChange={(event) => {
                  onWorkspaceChange(event.currentTarget.value);
                }}
              />
              <Button
                disabled={picking}
                onClick={() => {
                  reportPromiseErrors(pickWorkspace());
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
                  {recentWorkspaces.map((recentWorkspace) => (
                    <Button
                      aria-pressed={recentWorkspace === workspace}
                      className={recentButton}
                      key={recentWorkspace}
                      onClick={() => {
                        onWorkspaceChange(recentWorkspace);
                      }}
                      title={recentWorkspace}
                      type="button"
                    >
                      {recentWorkspace === workspace ? (
                        <Check size={14} />
                      ) : (
                        <History size={14} />
                      )}
                      <span className={recentPath}>{recentWorkspace}</span>
                    </Button>
                  ))}
                </div>
              </div>
            ) : null}
          </Field.Root>
        </div>
      </section>
      <Composer
        disabled={false}
        draft=""
        draftTarget={{ kind: "new" }}
        onSend={onSend}
      />
    </div>
  );
}
