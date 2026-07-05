import { Plus } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { css } from "styled-system/css";
import type { SessionInfo } from "../services/client";
import { button, panel, stack, textInput } from "../design";

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

export function Sidebar({
  cwd,
  sessions,
  activeId,
  onCreate,
  onSelect,
}: {
  cwd: string;
  sessions: SessionInfo[];
  activeId?: string;
  onCreate(workspace: string): Promise<void>;
  onSelect(id: string): void;
}) {
  const { t } = useTranslation();
  const [workspace, setWorkspace] = useState(cwd);
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
            <input
              className={textInput}
              value={workspace}
              onChange={(event) => setWorkspace(event.currentTarget.value)}
            />
          </label>
          <button className={button()} type="submit">
            <Plus size={14} /> {t("newSession")}
          </button>
        </form>
      </section>
      <nav className={list}>
        {sessions.map((session) => (
          <button
            className={button({ active: session.id === activeId })}
            key={session.id}
            onClick={() => onSelect(session.id)}
            type="button"
          >
            <div>{session.id}</div>
            <div className={itemMeta}>{session.workspace}</div>
          </button>
        ))}
      </nav>
    </>
  );
}
