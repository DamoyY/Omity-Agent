import { css } from "styled-system/css";

export const layout = css({
  bg: "canvas",
  color: "text",
  display: "grid",
  fontFamily: "body",
  gridTemplateColumns: {
    base: "minmax(0, 1fr)",
    lg: "auto minmax(0, 1fr)",
  },
  gridTemplateRows: {
    base: "minmax(8rem, 35vh) minmax(0, 1fr)",
    lg: "minmax(0, 1fr)",
  },
  h: "100vh",
  overflow: "hidden",
});

export const sidebar = css({
  bg: "sidebar",
  borderRightWidth: "1px",
  borderRightColor: "line",
  display: "grid",
  gridTemplateRows: "auto minmax(0, 1fr)",
  minH: 0,
  minW: 0,
  overflow: "hidden",
  w: { lg: "appSidebar" },
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
  p: "6",
});
