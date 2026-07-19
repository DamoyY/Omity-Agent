import { css } from "styled-system/css";

export const scroll = css({
  minH: 0,
  overflowY: "auto",
  overscrollBehavior: "contain",
  scrollbarGutter: "stable",
});
export const scrollContent = css({
  display: "grid",
  gridTemplateRows: "auto minmax(min-content, 1fr)",
  minH: "full",
});
export const setup = css({
  alignContent: "start",
  display: "grid",
  gap: "6",
  maxW: "content",
  minH: "full",
  mx: "auto",
  p: { _short: "4", base: "4", md: "8" },
  w: "full",
});
export const messageFlow = css({ alignSelf: "end" });
