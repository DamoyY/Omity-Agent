import { css } from "styled-system/css";

export const layout = css({
  bg: "canvas",
  color: "text",
  display: "grid",
  fontFamily: "body",
  gridTemplateColumns: {
    _topNav: "minmax(0, 1fr)",
    base: "minmax(0, 1fr)",
    lg: "auto minmax(0, 1fr)",
  },
  gridTemplateRows: {
    _topNav: "clamp(12rem, 28dvh, 24rem) minmax(0, 1fr)",
    base: "clamp(7.5rem, 26dvh, 9rem) minmax(0, 1fr)",
    lg: "minmax(0, 1fr)",
  },
  h: "100dvh",
  overflow: "hidden",
});
export const sidebar = css({
  bg: "sidebar",
  borderBottomColor: "line",
  borderBottomWidth: "1px",
  borderRightColor: "line",
  borderRightWidth: { _topNav: "0", base: "0", lg: "1px" },
  display: "grid",
  gridTemplateRows: "auto minmax(0, 1fr)",
  minH: 0,
  minW: 0,
  overflow: "hidden",
  w: { _topNav: "full", lg: "appSidebar" },
});
export const main = css({
  bg: "surfaceInset",
  h: "full",
  minH: 0,
  minW: 0,
  overflow: "hidden",
});
export const scroll = css({
  minH: 0,
  overflowY: "auto",
  overscrollBehavior: "contain",
  p: { _short: "3", base: "4", md: "6" },
  scrollbarGutter: "stable",
});
