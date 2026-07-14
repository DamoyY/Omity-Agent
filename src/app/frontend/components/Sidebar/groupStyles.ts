import { css } from "styled-system/css";
export const root = css({ display: "grid", minW: 0 });
export const header = css({
  alignItems: "center",
  bg: "sidebar",
  borderWidth: 0,
  color: "mutedStrong",
  display: "grid",
  fontSize: "xs",
  gap: "1.5",
  gridTemplateColumns: "auto minmax(0, 1fr) auto",
  h: "7",
  px: "2",
  position: "sticky",
  textAlign: "left",
  top: 0,
  w: "full",
  zIndex: 1,
  _hover: { bg: "control" },
});
export const chevron = css({ transition: "transform 150ms ease" });
export const collapsedChevron = css({ transform: "rotate(-90deg)" });
export const workspaceName = css({
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});
export const counts = css({
  alignItems: "center",
  color: "muted",
  display: "flex",
  gap: "1.5",
});
export const runningCount = css({ color: "statusModel" });
export const sessions = css({ display: "grid", gap: "0.5", pb: "2" });
export const historyToggle = css({
  bg: "transparent",
  borderWidth: 0,
  color: "muted",
  fontSize: "2xs",
  h: "7",
  justifyContent: "flex-start",
  ml: "2px",
  px: "3",
  _hover: { bg: "control", color: "mutedStrong" },
});
export const item = css({
  alignItems: "stretch",
  borderBottomColor: "line",
  borderBottomWidth: "1px",
  borderLeftColor: "transparent",
  borderLeftWidth: "4px",
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr)",
  minW: 0,
  overflow: "hidden",
  transition: "background 120ms ease",
  _hover: { bg: "control" },
  _focusWithin: { bg: "control" },
});
export const selected = css({
  bg: "transparent",
  borderLeftColor: "text",
  _focusWithin: { bg: "transparent" },
  _hover: { bg: "transparent" },
});
export const row = css({
  bg: "transparent",
  borderWidth: 0,
  display: "grid",
  fontSize: "xs",
  gap: "2",
  gridTemplateColumns: "auto minmax(0, 1fr) auto auto",
  h: "8",
  justifyContent: "stretch",
  px: "2.5",
  textAlign: "left",
  w: "full",
  _hover: { bg: "transparent" },
  _focusVisible: {
    bg: "transparent",
    outline: "none",
  },
});
export const fingerprint = css({
  color: "mutedStrong",
  letterSpacing: "0.04em",
  overflow: "hidden",
  textOverflow: "ellipsis",
});
export const selectedFingerprint = css({
  color: "text",
  fontWeight: "bold",
  letterSpacing: "0.08em",
});
export const time = css({
  color: "muted",
  fontSize: "2xs",
  whiteSpace: "nowrap",
});
