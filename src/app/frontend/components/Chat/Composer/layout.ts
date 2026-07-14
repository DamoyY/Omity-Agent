import { css } from "styled-system/css";
export const composerFrame = css({
  bg: "surface",
  borderTopWidth: "1px",
  borderTopColor: "line",
  display: "grid",
  gap: "3",
  gridTemplateColumns: {
    base: "minmax(0, 1fr)",
    md: "minmax(0, 1fr) auto",
  },
  p: { base: "3", md: "6" },
  w: "full",
});
export const composerActions = css({
  display: "flex",
  flexDirection: { base: "row", md: "column" },
  gap: { base: "3", md: "0" },
  h: "full",
  justifyContent: { base: "space-between", md: "initial" },
  minW: { md: "controlColumn" },
});
export const composerControls = css({
  display: "grid",
  gap: "2",
  gridAutoFlow: { base: "column", md: "row" },
});
export const composerRole = css({
  alignItems: "center",
  color: "mutedStrong",
  display: "flex",
  justifyContent: "center",
  mt: { md: "auto" },
  minH: "8",
});
