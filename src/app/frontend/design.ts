import { css } from "styled-system/css";

export const layout = css({
  bg: "canvas",
  color: "text",
  display: "grid",
  fontFamily: "body",
  gridTemplateColumns: "22rem minmax(0, 1fr)",
  h: "100vh",
  overflow: "hidden",
});

export const sidebar = css({
  bg: "sidebar",
  borderRightWidth: "1px",
  borderRightColor: "line",
  display: "grid",
  gridTemplateRows: "auto auto 1fr",
  minH: 0,
  minW: 0,
  overflow: "hidden",
});

export const main = css({
  bg: "surfaceInset",
  display: "grid",
  gridTemplateRows: "auto minmax(0, 1fr) auto",
  minH: 0,
  minW: 0,
  overflow: "hidden",
});

export const scroll = css({
  minH: 0,
  overflowY: "auto",
  p: "6",
});
