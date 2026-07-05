import { FolderOpen, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { css, cx } from "styled-system/css";
import type { SessionInfo } from "../services/client";
import { Button, Field, IconButton, Input } from "./ParkUI";

type SessionView = SessionInfo & {
  draft?: boolean;
};

const title = css({
  fontSize: "md",
  fontWeight: "normal",
  m: 0,
});

const panel = css({
  borderBottomWidth: "1px",
  borderBottomColor: "line",
  p: "3",
});

const list = css({
  alignContent: "start",
  display: "grid",
  gap: "2",
  gridAutoRows: "max-content",
  overflowX: "hidden",
  overflowY: "auto",
  p: "3",
});

const itemTitle = css({
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

const itemMeta = css({
  color: "muted",
  fontSize: "xs",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

const sessionRow = css({
  alignItems: "start",
  display: "grid",
  gap: "2",
  gridTemplateColumns: "minmax(0, 1fr) auto",
  minW: 0,
});

const pickerRow = css({
  display: "grid",
  gap: "2",
  gridTemplateColumns: "1fr",
  minW: 0,
});

const sessionButton = css({
  alignItems: "stretch",
  flexDirection: "column",
  h: "auto",
  justifyContent: "flex-start",
  minW: 0,
  overflow: "hidden",
  py: "2",
  textAlign: "left",
});

const activeSession = css({
  outlineWidth: "1px",
  outlineStyle: "solid",
  outlineColor: "text",
});

const stack = css({
  display: "grid",
  gap: "2",
});

const fullButton = css({
  justifyContent: "flex-start",
  w: "full",
});

const pathInput = css({
  minW: 0,
  textOverflow: "ellipsis",
});

export function Sidebar({
  cwd,
  sessions,
  activeId,
  onCreate,
  onDelete,
  onPickWorkspace,
  onSelect,
}: {
  cwd: string;
  sessions: SessionView[];
  activeId?: string;
  onCreate(workspace: string): Promise<void>;
  onDelete(id: string): Promise<void>;
  onPickWorkspace(): Promise<string | null>;
  onSelect(id: string): void;
}) {
  const { t } = useTranslation();
  const [workspace, setWorkspace] = useState(cwd);
  const [picking, setPicking] = useState(false);
  useEffect(() => setWorkspace(cwd), [cwd]);
  return (
    <>
      <section className={panel}>
        <h1 className={title}>{t("brand")}</h1>
      </section>
      <section className={panel}>
        <form
          className={stack}
          onSubmit={(event) => {
            event.preventDefault();
            void onCreate(workspace);
          }}
        >
          <Field.Root>
            <Field.Label>{t("workspace")}</Field.Label>
            <span className={pickerRow}>
              <Input
                className={pathInput}
                value={workspace}
                onChange={(event) => setWorkspace(event.currentTarget.value)}
              />
              <Button
                className={fullButton}
                disabled={picking}
                onClick={async () => {
                  setPicking(true);
                  try {
                    const selected = await onPickWorkspace();
                    if (selected) setWorkspace(selected);
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
          <Button className={fullButton} type="submit">
            <Plus size={14} />
            {t("newSession")}
          </Button>
        </form>
      </section>
      <nav className={list}>
        {sessions.map((session) => (
          <div className={sessionRow} key={session.id}>
            <Button
              className={cx(
                sessionButton,
                session.id === activeId && activeSession,
              )}
              onClick={() => onSelect(session.id)}
              type="button"
            >
              <div className={itemTitle}>
                {session.draft ? t("newSession") : session.id}
              </div>
              <div className={itemMeta}>{session.workspace}</div>
            </Button>
            <IconButton
              aria-label={t("delete")}
              onClick={() => void onDelete(session.id)}
              type="button"
            >
              <Trash2 size={14} />
            </IconButton>
          </div>
        ))}
      </nav>
    </>
  );
}
