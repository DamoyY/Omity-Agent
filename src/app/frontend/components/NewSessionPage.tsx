import { FolderOpen } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { css } from "styled-system/css";
import { Composer } from "./Composer";
import { Button, Field, Input } from "./ParkUI";

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

export function NewSessionPage({
  pageClassName,
  workspace,
  onPickWorkspace,
  onSend,
  onWorkspaceChange,
}: {
  pageClassName: string;
  workspace: string;
  onPickWorkspace(): Promise<string | null>;
  onSend(content: string): Promise<void>;
  onWorkspaceChange(workspace: string): void;
}) {
  const { t } = useTranslation();
  const [picking, setPicking] = useState(false);
  return (
    <div className={pageClassName}>
      <div />
      <section className={content}>
        <div className={form}>
          <h1 className={title}>{t("newSession")}</h1>
          <Field.Root>
            <Field.Label>{t("workspace")}</Field.Label>
            <span className={workspaceRow}>
              <Input
                className={pathInput}
                value={workspace}
                onChange={(event) =>
                  onWorkspaceChange(event.currentTarget.value)
                }
              />
              <Button
                disabled={picking}
                onClick={async () => {
                  setPicking(true);
                  try {
                    const selected = await onPickWorkspace();
                    if (selected) onWorkspaceChange(selected);
                  } finally {
                    setPicking(false);
                  }
                }}
                type="button"
              >
                <FolderOpen size={14} /> {t("chooseFolder")}
              </Button>
            </span>
          </Field.Root>
        </div>
      </section>
      <Composer disabled={false} onSend={onSend} />
    </div>
  );
}
