import { Plus, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { css, cx } from "styled-system/css";
import type { SessionInfo } from "../services/client";
import { Button, IconButton } from "./ParkUI";

const title = css({
  fontSize: "md",
  fontWeight: "normal",
  m: 0,
  color: "mutedStrong",
});

const panel = css({
  bg: "sidebar",
  borderBottomWidth: "1px",
  borderBottomColor: "line",
  p: "3",
});

const list = css({
  alignContent: "start",
  bg: "sidebar",
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

const workspaceGroup = css({
  display: "grid",
  gap: "2",
  minW: 0,
});

const workspaceTitle = css({
  color: "muted",
  fontSize: "xs",
  fontWeight: "normal",
  m: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

const workspaceSessions = css({
  display: "grid",
  gap: "2",
});

const sessionRow = css({
  alignItems: "start",
  display: "grid",
  gap: "2",
  gridTemplateColumns: "minmax(0, 1fr) auto",
  minW: 0,
});

const sessionButton = css({
  alignItems: "stretch",
  bg: "surface",
  borderColor: "line",
  flexDirection: "column",
  h: "auto",
  justifyContent: "flex-start",
  minW: 0,
  overflow: "hidden",
  py: "2",
  textAlign: "left",
});

const activeSession = css({
  bg: "surfaceRaised",
  borderColor: "lineStrong",
  outlineWidth: "1px",
  outlineStyle: "solid",
  outlineColor: "lineStrong",
});

const stack = css({
  display: "grid",
  gap: "2",
});

const fullButton = css({
  justifyContent: "flex-start",
  w: "full",
});

export function Sidebar({
  sessions,
  activeId,
  onCreate,
  onDelete,
  onSelect,
}: {
  sessions: SessionInfo[];
  activeId?: string;
  onCreate: () => void;
  onDelete: (id: string) => Promise<void>;
  onSelect: (id: string) => void;
}) {
  const { t } = useTranslation();
  const groups = groupSessions(sessions);
  return (
    <>
      <section className={panel}>
        <h1 className={title}>{t("brand")}</h1>
      </section>
      <section className={panel}>
        <div className={stack}>
          <Button className={fullButton} onClick={onCreate} type="button">
            <Plus size={14} />
            {t("newSession")}
          </Button>
        </div>
      </section>
      <nav className={list}>
        {groups.map((group) => (
          <section className={workspaceGroup} key={group.workspace}>
            <h2 className={workspaceTitle} title={group.workspace}>
              {group.workspace}
            </h2>
            <div className={workspaceSessions}>
              {group.sessions.map((session) => (
                <div className={sessionRow} key={session.id}>
                  <Button
                    className={cx(
                      sessionButton,
                      session.id === activeId && activeSession,
                    )}
                    onClick={() => {
                      onSelect(session.id);
                    }}
                    type="button"
                  >
                    <div className={itemTitle}>{session.id}</div>
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
            </div>
          </section>
        ))}
      </nav>
    </>
  );
}

function groupSessions(sessions: SessionInfo[]) {
  const groups: { workspace: string; sessions: SessionInfo[] }[] = [];
  for (const session of sessions) {
    const group = groups.find((item) => item.workspace === session.workspace);
    if (group) {
      group.sessions.push(session);
    } else {
      groups.push({ workspace: session.workspace, sessions: [session] });
    }
  }
  return groups;
}
