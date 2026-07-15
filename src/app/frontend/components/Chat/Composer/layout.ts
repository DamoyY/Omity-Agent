import { css } from "styled-system/css";

export const composerFrame = css({
  bg: "surface",
  borderTopColor: "line",
  borderTopWidth: "1px",
  display: "grid",
  gap: { _short: "2", base: "3" },
  gridTemplateColumns: {
    base: "minmax(0, 1fr)",
    md: "minmax(0, 1fr) auto",
  },
  p: { _short: "3", base: "3", md: "6" },
  w: "full",
});
export const composerActions = css({
  display: "flex",
  flexDirection: { base: "row", md: "column", smDown: "column" },
  gap: { base: "3", md: "0", smDown: "2" },
  h: "full",
  justifyContent: { base: "space-between", md: "initial", smDown: "initial" },
  minW: { md: "controlColumn" },
});
export const composerControls = css({
  "& > button": { minW: { _coarse: "11" } },
  display: "grid",
  gap: "2",
  gridAutoColumns: { smDown: "minmax(0, 1fr)" },
  gridAutoFlow: { base: "column", md: "row" },
  w: { smDown: "full" },
});
export const composerRole = css({
  alignItems: "center",
  color: "mutedStrong",
  display: { base: "flex", smDown: "none" },
  justifyContent: "center",
  minH: { _coarse: "11", base: "8" },
  mt: { md: "auto" },
});
