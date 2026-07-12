import { Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { css } from "styled-system/css";
import type { SessionInfo } from "../../services/client";
import { Button } from "../ParkUI";
import { SessionGroup } from "./SessionGroup";
import { groupSessions } from "./sessions";

const panel = css({
  alignItems: "center",
  bg: "sidebar",
  borderBottomColor: "line",
  borderBottomWidth: "1px",
  display: "grid",
  gap: "2",
  gridTemplateColumns: "minmax(0, 1fr) auto",
  minH: "12",
  px: "3",
});
const brand = css({
  color: "text",
  fontSize: "sm",
  fontWeight: "medium",
  letterSpacing: "0.08em",
  m: 0,
});
const total = css({
  color: "muted",
  fontSize: "xs",
  fontWeight: "normal",
  letterSpacing: 0,
});
const newButton = css({ borderColor: "line", h: "7", px: "2.5" });
const list = css({
  alignContent: "start",
  bg: "sidebar",
  display: "grid",
  minH: 0,
  overflowX: "hidden",
  overflowY: "auto",
  px: "2",
  scrollbarGutter: "stable",
});

interface SidebarProps {
  sessions: SessionInfo[];
  activeId?: string;
  showCreate: boolean;
  onCreate: () => void;
  onSelect: (id: string) => void;
}

export function Sidebar({
  sessions,
  activeId,
  showCreate,
  onCreate,
  onSelect,
}: SidebarProps) {
  const { t } = useTranslation();
  return (
    <>
      <header className={panel}>
        <h1 className={brand}>
          {t("brand")} <span className={total}>/ {sessions.length}</span>
        </h1>
        {showCreate && (
          <Button
            aria-label={t("newSession")}
            className={newButton}
            onClick={onCreate}
            title={t("newSession")}
            type="button"
          >
            <Plus size={14} />
            {t("new")}
          </Button>
        )}
      </header>
      <nav aria-label={t("sessions")} className={list}>
        {groupSessions(sessions).map((group) => (
          <SessionGroup
            activeId={activeId}
            group={group}
            key={group.workspace}
            onSelect={onSelect}
          />
        ))}
      </nav>
    </>
  );
}
