import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { EditorView } from "@codemirror/view";
import { css } from "styled-system/css";
import { tags } from "@lezer/highlight";

export const root = css({
  _focusWithin: {
    outlineColor: "mutedStrong",
    outlineOffset: "2px",
    outlineStyle: "solid",
    outlineWidth: "1px",
  },
  bg: "surfaceInset",
  borderColor: "lineStrong",
  borderWidth: "1px",
  minW: 0,
  overflow: "hidden",
});
export const fixedRoot = css({ h: "composerEditor" });
export const disabledRoot = css({
  borderColor: "line",
  opacity: 0.65,
});
export const bareRoot = css({
  _focusWithin: { outlineOffset: "-1px" },
  alignSelf: "start",
  borderWidth: "0",
});
export const codeMirror = css({ cursor: "text" });
export const fixedCodeMirror = css({
  "& > .cm-editor": { h: "full" },
  h: "full",
});
export const editorTheme = EditorView.theme(
  {
    "&": {
      backgroundColor: "var(--colors-surface)",
      color: "var(--colors-text)",
      fontFamily: "var(--fonts-mono)",
      fontSize: "14px",
    },
    ".cm-activeLine": {
      backgroundColor: "var(--colors-active-line)",
    },
    ".cm-activeLineGutter": {
      backgroundColor: "var(--colors-control)",
    },
    ".cm-content": {
      caretColor: "var(--colors-text)",
      lineHeight: "1.6",
      padding: "10px 0",
    },
    ".cm-cursor, .cm-dropCursor": {
      borderLeftColor: "var(--colors-text)",
    },
    ".cm-gutters": {
      backgroundColor: "var(--colors-control)",
      borderRight: "1px solid var(--colors-line)",
      color: "var(--colors-muted)",
    },
    ".cm-line": { padding: "0 12px" },
    ".cm-placeholder": {
      color: "var(--colors-muted)",
      fontStyle: "normal",
    },
    ".cm-scroller": { cursor: "text", overflow: "auto" },
    ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": {
      backgroundColor: "var(--colors-selection)",
    },
  },
  { dark: true },
);
const markdownHighlight = HighlightStyle.define([
  { color: "var(--colors-syntax-title)", fontWeight: "700", tag: tags.heading },
  { color: "var(--colors-syntax-number)", fontWeight: "700", tag: tags.strong },
  {
    color: "var(--colors-syntax-keyword)",
    fontStyle: "italic",
    tag: tags.emphasis,
  },
  {
    color: "var(--colors-syntax-meta)",
    tag: tags.link,
    textDecoration: "underline",
  },
  { color: "var(--colors-syntax-string)", tag: tags.url },
  { color: "var(--colors-syntax-addition)", tag: tags.monospace },
  { color: "var(--colors-muted-strong)", tag: tags.quote },
  { color: "var(--colors-syntax-number)", tag: tags.list },
  {
    color: "var(--colors-muted)",
    tag: tags.strikethrough,
    textDecoration: "line-through",
  },
  { color: "var(--colors-syntax-comment)", tag: tags.meta },
  { color: "var(--colors-syntax-comment)", tag: tags.contentSeparator },
]);
export const markdownSyntax = syntaxHighlighting(markdownHighlight);
export const fluidTheme = EditorView.theme({
  "&": { height: "auto" },
  ".cm-content": { minHeight: "2.5rem" },
  ".cm-gutters": { color: "var(--colors-muted-strong)" },
  ".cm-placeholder": { color: "var(--colors-muted-strong)" },
  ".cm-scroller": { overflow: "visible" },
});
export const fixedTheme = EditorView.theme({
  "&": { height: "100%" },
  ".cm-content": { minHeight: "100%" },
});
