import { css, cva } from "styled-system/css";

export const layout = css({
  bg: "canvas",
  color: "text",
  display: "grid",
  fontFamily: "body",
  gridTemplateColumns: "18rem 1fr",
  h: "100vh",
  overflow: "hidden",
});

export const sidebar = css({
  borderRightWidth: "1px",
  borderRightColor: "line",
  display: "grid",
  gridTemplateRows: "auto auto 1fr",
  minH: 0,
  minW: 0,
});

export const panel = css({
  p: "4",
  borderBottomWidth: "1px",
  borderBottomColor: "line",
});

export const stack = css({
  display: "grid",
  gap: "3",
});

export const main = css({
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

export const textInput = css({
  bg: "canvas",
  borderWidth: "1px",
  borderColor: "line",
  color: "text",
  fontFamily: "body",
  outline: "none",
  px: "3",
  py: "2",
  w: "full",
  _focus: { borderColor: "muted" },
});

export const button = cva({
  base: {
    bg: "canvas",
    borderWidth: "1px",
    borderColor: "line",
    color: "text",
    cursor: "pointer",
    fontFamily: "body",
    px: "3",
    py: "2",
    textAlign: "left",
    _hover: { borderColor: "muted" },
    _disabled: { color: "muted", cursor: "default" },
  },
  variants: {
    active: {
      true: { borderColor: "text" },
      false: {},
    },
  },
  defaultVariants: { active: false },
});

export const message = cva({
  base: {
    display: "grid",
    gap: "2",
    maxW: "48rem",
    mb: "6",
  },
  variants: {
    role: {
      user: { ml: "auto", textAlign: "right" },
      assistant: {},
      tool: { color: "muted", fontFamily: "mono", fontSize: "sm" },
    },
  },
});
