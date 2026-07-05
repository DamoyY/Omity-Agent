import { FolderOpen, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { css } from "styled-system/css";
import type { SessionInfo } from "../services/client";
import { button, panel, stack, textInput } from "../design";

type SessionView = SessionInfo & {
  draft?: boolean;
};

const title = css({
  fontSize: "md",
  fontWeight: "normal",
});

const list = css({
  display: "grid",
  gap: "2",
  overflowY: "auto",
  p: "4",
});

const itemMeta = css({
  color: "muted",
  fontSize: "xs",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

const sessionRow = css({
  display: "grid",
  gap: "2",
  gridTemplateColumns: "1fr auto",
});

const pickerRow = css({
  display: "grid",
  gap: "2",
  gridTemplateColumns: "1fr auto",
});

const deleteButton = css({
  alignItems: "center",
  bg: "canvas",
  borderWidth: "1px",
  borderColor: "line",
  color: "muted",
  cursor: "pointer",
  display: "flex",
  px: "3",
  _hover: { borderColor: "muted", color: "text" },
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
          <label>
            <span className={itemMeta}>{t("workspace")}</span>
            <span className={pickerRow}>
              <input className={textInput} readOnly value={workspace} />
              <button
                className={button()}
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
              </button>
            </span>
          </label>
          <button className={button()} type="submit">
            <Plus size={14} /> {t("newSession")}
          </button>
        </form>
      </section>
      <nav className={list}>
        {sessions.map((session) => (
          <div className={sessionRow} key={session.id}>
            <button
              className={button({ active: session.id === activeId })}
              onClick={() => onSelect(session.id)}
              type="button"
            >
              <div>{session.draft ? t("newSession") : session.id}</div>
              <div className={itemMeta}>{session.workspace}</div>
            </button>
            <button
              aria-label={t("delete")}
              className={deleteButton}
              onClick={() => void onDelete(session.id)}
              type="button"
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </nav>
    </>
  );
}
