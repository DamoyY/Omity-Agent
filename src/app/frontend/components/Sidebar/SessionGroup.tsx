import { Button, LinkButton } from "../ParkUI";
import {
  type SessionGroup as Group,
  formatUpdatedAt,
  isRunning,
  sessionLabel,
  workspaceLabel,
} from "./sessions";
import { type MouseEvent, useCallback, useState } from "react";
import {
  chevron,
  collapsedChevron,
  counts,
  fingerprint,
  header,
  historyToggle,
  item,
  root,
  row,
  runningCount,
  selected,
  selectedFingerprint,
  sessions,
  time,
  workspaceName,
} from "./groupStyles";
import { ChevronDown } from "lucide-react";
import { Status } from "./Status";
import { cx } from "styled-system/css";
import { pagePath } from "../../route";
import { useTranslation } from "react-i18next";

interface Props {
  group: Group;
  activeId?: string;
  onSelect: (id: string) => void;
}
interface SessionItemProps {
  active: boolean;
  language: string;
  onSelect: Props["onSelect"];
  session: Group["sessions"][number];
}
function SessionItem({ active, language, onSelect, session }: SessionItemProps) {
  const handleSelect = useCallback(
    (event: MouseEvent<HTMLAnchorElement>) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }
      event.preventDefault();
      onSelect(session.id);
    },
    [onSelect, session.id],
  );
  return (
    <div className={cx("group", item, active && selected)}>
      <LinkButton
        aria-current={active ? "page" : undefined}
        aria-label={session.id}
        className={row}
        href={pagePath({ id: session.id, kind: "session" })}
        onClick={handleSelect}
        title={session.id}
        variant="ghost"
      >
        <span aria-hidden="true">#</span>
        <span className={cx(fingerprint, active && selectedFingerprint)}>
          {sessionLabel(session.id)}
        </span>
        <Status compact error={session.error} status={session.status} />
        <time className={time} dateTime={new Date(session.updatedAt * 1000).toISOString()}>
          {formatUpdatedAt(session.updatedAt, language)}
        </time>
      </LinkButton>
    </div>
  );
}
export function SessionGroup({ group, activeId, onSelect }: Props) {
  const { t, i18n } = useTranslation();
  const [expanded, setExpanded] = useState(true);
  const [historyExpanded, setHistoryExpanded] = useState(false);
  const toggleExpanded = useCallback(() => {
    setExpanded((value) => !value);
  }, []);
  const toggleHistory = useCallback(() => {
    setHistoryExpanded((value) => !value);
  }, []);
  const runningSessions = group.sessions.filter(isRunning);
  const historySessions = group.sessions.filter((session) => !isRunning(session));
  const selectedHistory = historySessions.find(({ id }) => id === activeId);
  const compactHistory = selectedHistory ? [selectedHistory] : [];
  const visibleSessions =
    runningSessions.length > 0
      ? [...runningSessions, ...(historyExpanded ? historySessions : compactHistory)]
      : group.sessions;
  const hiddenHistoryCount = historySessions.length - compactHistory.length;
  return (
    <section className={root}>
      <button className={header} onClick={toggleExpanded} title={group.workspace} type="button">
        <ChevronDown className={cx(chevron, !expanded && collapsedChevron)} size={13} />
        <span className={workspaceName}>{workspaceLabel(group.workspace)}</span>
        <span className={counts}>
          {group.runningCount > 0 && <span className={runningCount}>● {group.runningCount}</span>}
          <span>{group.sessions.length}</span>
        </span>
      </button>
      {expanded && (
        <div className={sessions}>
          {visibleSessions.map((session) => (
            <SessionItem
              active={session.id === activeId}
              key={session.id}
              language={i18n.language}
              onSelect={onSelect}
              session={session}
            />
          ))}
          {runningSessions.length > 0 && hiddenHistoryCount > 0 && (
            <Button className={historyToggle} onClick={toggleHistory} type="button" variant="ghost">
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
