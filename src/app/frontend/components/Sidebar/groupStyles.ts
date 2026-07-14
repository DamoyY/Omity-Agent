import { css } from "styled-system/css";
export const root = css({ display: "grid", minW: 0 });
export const header = css({
  _hover: { bg: "control" },
  alignItems: "center",
  bg: "sidebar",
  borderWidth: 0,
  color: "mutedStrong",
  display: "grid",
  fontSize: "xs",
  gap: "1.5",
  gridTemplateColumns: "auto minmax(0, 1fr) auto",
  h: "7",
  position: "sticky",
  px: "2",
  textAlign: "left",
  top: 0,
  w: "full",
  zIndex: 1,
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
  _hover: { bg: "control", color: "mutedStrong" },
  bg: "transparent",
  borderWidth: 0,
  color: "muted",
  fontSize: "2xs",
  h: "7",
  justifyContent: "flex-start",
  ml: "2px",
  px: "3",
});
export const item = css({
  _focusWithin: { bg: "control" },
  _hover: { bg: "control" },
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
});
export const selected = css({
  _focusWithin: { bg: "transparent" },
  _hover: { bg: "transparent" },
  bg: "transparent",
  borderLeftColor: "text",
});
export const row = css({
  _focusVisible: {
    bg: "transparent",
    outline: "none",
  },
  _hover: { bg: "transparent" },
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
