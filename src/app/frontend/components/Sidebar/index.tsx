import { Plus, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { css, cx } from "styled-system/css";
import type { SessionInfo } from "../../services/client";
import { Button, IconButton } from "../ParkUI";
import { reportPromiseErrors } from "../../services/errors";
import { Status } from "./Status";

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
const workspaceGroup = css({ display: "grid", gap: "2", minW: 0 });
const workspaceTitle = css({
  color: "muted",
  fontSize: "xs",
  fontWeight: "normal",
  m: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});
const workspaceSessions = css({ display: "grid", gap: "2" });
const sessionItem = css({
  alignItems: "stretch",
  bg: "surface",
  borderColor: "line",
  borderLeftWidth: "3px",
  borderRightWidth: "1px",
  borderTopWidth: "1px",
  borderBottomWidth: "1px",
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) auto",
  minW: 0,
});
const sessionButton = css({
  alignItems: "stretch",
  bg: "transparent",
  borderWidth: "0",
  flexDirection: "column",
  h: "auto",
  justifyContent: "flex-start",
  minW: 0,
  overflow: "hidden",
  py: "2",
  textAlign: "left",
});
const activeSession = css({
  bg: "control",
  borderColor: "lineStrong",
  borderLeftColor: "statusModel",
});
const sessionContent = css({
  alignItems: "center",
  display: "grid",
  gap: "2",
  gridTemplateColumns: "minmax(0, 1fr) auto",
  w: "full",
});
const itemTitle = css({
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});
const deleteButton = css({
  alignSelf: "stretch",
  bg: "transparent",
  borderTopWidth: "0",
  borderRightWidth: "0",
  borderBottomWidth: "0",
  borderLeftColor: "line",
  borderLeftWidth: "1px",
  color: "muted",
  h: "auto",
  _hover: {
    bg: "controlHover",
    color: "statusError",
  },
});
const fullButton = css({ justifyContent: "flex-start", w: "full" });
const footer = css({
  bg: "sidebar",
  borderTopColor: "line",
  borderTopWidth: "1px",
  p: "3",
});

interface SidebarProps {
  sessions: SessionInfo[];
  activeId?: string;
  showCreate: boolean;
  onCreate: () => void;
  onDelete: (id: string) => Promise<void>;
  onSelect: (id: string) => void;
}

export function Sidebar({
  sessions,
  activeId,
  showCreate,
  onCreate,
  onDelete,
  onSelect,
}: SidebarProps) {
  const { t } = useTranslation();
  return (
    <>
      <section className={panel}>
        <h1 className={title}>{t("brand")}</h1>
      </section>
      <nav className={list}>
        {groupSessions(sessions).map((group) => (
          <section className={workspaceGroup} key={group.workspace}>
            <h2 className={workspaceTitle} title={group.workspace}>
              {group.workspace}
            </h2>
            <div className={workspaceSessions}>
              {group.sessions.map((session) => (
                <div
                  className={cx(
                    sessionItem,
                    session.id === activeId && activeSession,
                  )}
                  key={session.id}
                >
                  <Button
                    aria-current={session.id === activeId ? "page" : undefined}
                    className={sessionButton}
                    onClick={() => {
                      onSelect(session.id);
                    }}
                    type="button"
                  >
                    <span className={sessionContent}>
                      <span className={itemTitle}>{session.id}</span>
                      <Status error={session.error} status={session.status} />
                    </span>
                  </Button>
                  <IconButton
                    aria-label={t("delete")}
                    className={deleteButton}
                    onClick={() => {
                      reportPromiseErrors(onDelete(session.id));
                    }}
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
      {showCreate && (
        <section className={footer}>
          <Button className={fullButton} onClick={onCreate} type="button">
            <Plus size={14} />
            {t("newSession")}
          </Button>
        </section>
      )}
    </>
  );
}

function groupSessions(sessions: SessionInfo[]) {
  const groups: { workspace: string; sessions: SessionInfo[] }[] = [];
  for (const session of sessions) {
    const group = groups.find((item) => item.workspace === session.workspace);
    if (group) group.sessions.push(session);
    else groups.push({ workspace: session.workspace, sessions: [session] });
  }
  return groups;
}
