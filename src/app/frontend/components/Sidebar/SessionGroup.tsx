import { ChevronDown } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { cx } from "styled-system/css";
import { Button } from "../ParkUI";
import { Status } from "./Status";
import * as styles from "./groupStyles";
import {
  formatUpdatedAt,
  isRunning,
  sessionLabel,
  workspaceLabel,
  type SessionGroup as Group,
} from "./sessions";

interface Props {
  group: Group;
  activeId?: string;
  onSelect: (id: string) => void;
}

export function SessionGroup({ group, activeId, onSelect }: Props) {
  const { t, i18n } = useTranslation();
  const [expanded, setExpanded] = useState(true);
  const [historyExpanded, setHistoryExpanded] = useState(false);
  const runningSessions = group.sessions.filter(isRunning);
  const historySessions = group.sessions.filter(
    (session) => !isRunning(session),
  );
  const selectedHistory = historySessions.find(({ id }) => id === activeId);
  const compactHistory = selectedHistory ? [selectedHistory] : [];
  const visibleSessions =
    runningSessions.length > 0
      ? [
          ...runningSessions,
          ...(historyExpanded ? historySessions : compactHistory),
        ]
      : group.sessions;
  const hiddenHistoryCount = historySessions.length - compactHistory.length;
  return (
    <section className={styles.root}>
      <button
        className={styles.header}
        onClick={() => {
          setExpanded((value) => !value);
        }}
        title={group.workspace}
        type="button"
      >
        <ChevronDown
          className={cx(styles.chevron, !expanded && styles.collapsedChevron)}
          size={13}
        />
        <span className={styles.workspaceName}>
          {workspaceLabel(group.workspace)}
        </span>
        <span className={styles.counts}>
          {group.runningCount > 0 && (
            <span className={styles.runningCount}>● {group.runningCount}</span>
          )}
          <span>{group.sessions.length}</span>
        </span>
      </button>
      {expanded && (
        <div className={styles.sessions}>
          {visibleSessions.map((session) => (
            <div
              className={cx(
                "group",
                styles.item,
                session.id === activeId && styles.selected,
              )}
              key={session.id}
            >
              <Button
                aria-current={session.id === activeId ? "page" : undefined}
                aria-label={session.id}
                className={styles.row}
                onClick={() => {
                  onSelect(session.id);
                }}
                title={session.id}
                type="button"
                variant="ghost"
              >
                <span aria-hidden="true">#</span>
                <span
                  className={cx(
                    styles.fingerprint,
                    session.id === activeId && styles.selectedFingerprint,
                  )}
                >
                  {sessionLabel(session.id)}
                </span>
                <Status compact error={session.error} status={session.status} />
                <time
                  className={styles.time}
                  dateTime={new Date(session.updatedAt * 1000).toISOString()}
                >
                  {formatUpdatedAt(session.updatedAt, i18n.language)}
                </time>
              </Button>
            </div>
          ))}
          {runningSessions.length > 0 && hiddenHistoryCount > 0 && (
            <Button
              className={styles.historyToggle}
              onClick={() => {
                setHistoryExpanded((value) => !value);
              }}
              type="button"
              variant="ghost"
            >
              {t(historyExpanded ? "hideHistory" : "showHistory", {
                count: hiddenHistoryCount,
              })}
            </Button>
          )}
        </div>
      )}
    </section>
  );
}
