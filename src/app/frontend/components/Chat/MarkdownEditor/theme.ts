import { syntaxHighlighting, HighlightStyle } from "@codemirror/language";
import { EditorView } from "@codemirror/view";
import { tags } from "@lezer/highlight";
import { css } from "styled-system/css";
export const root = css({
  bg: "surfaceInset",
  borderColor: "lineStrong",
  borderWidth: "1px",
  minW: 0,
  overflow: "hidden",
  _focusWithin: {
    outlineColor: "mutedStrong",
    outlineOffset: "2px",
    outlineStyle: "solid",
    outlineWidth: "1px",
  },
});
export const fixedRoot = css({ h: "composerEditor" });
export const disabledRoot = css({
  borderColor: "line",
  opacity: 0.65,
});
export const bareRoot = css({
  alignSelf: "start",
  borderWidth: "0",
  _focusWithin: { outlineOffset: "-1px" },
});
export const codeMirror = css({ cursor: "text" });
export const fixedCodeMirror = css({
  h: "full",
  "& > .cm-editor": { h: "full" },
});
export const editorTheme = EditorView.theme(
  {
    "&": {
      backgroundColor: "var(--colors-surface)",
      color: "var(--colors-text)",
      fontFamily: "var(--fonts-mono)",
      fontSize: "14px",
    },
    ".cm-content": {
      caretColor: "var(--colors-text)",
      lineHeight: "1.6",
      padding: "10px 0",
    },
    ".cm-gutters": {
      backgroundColor: "var(--colors-control)",
      borderRight: "1px solid var(--colors-line)",
      color: "var(--colors-muted)",
    },
    ".cm-activeLine": {
      backgroundColor: "var(--colors-active-line)",
    },
    ".cm-activeLineGutter": {
      backgroundColor: "var(--colors-control)",
    },
    ".cm-cursor, .cm-dropCursor": {
      borderLeftColor: "var(--colors-text)",
    },
    ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": {
      backgroundColor: "var(--colors-selection)",
    },
    ".cm-scroller": { cursor: "text", overflow: "auto" },
    ".cm-line": { padding: "0 12px" },
    ".cm-placeholder": {
      color: "var(--colors-muted)",
      fontStyle: "normal",
    },
  },
  { dark: true },
);
const markdownHighlight = HighlightStyle.define([
  { tag: tags.heading, color: "var(--colors-syntax-title)", fontWeight: "700" },
  { tag: tags.strong, color: "var(--colors-syntax-number)", fontWeight: "700" },
  {
    tag: tags.emphasis,
    color: "var(--colors-syntax-keyword)",
    fontStyle: "italic",
  },
  {
    tag: tags.link,
    color: "var(--colors-syntax-meta)",
    textDecoration: "underline",
  },
  { tag: tags.url, color: "var(--colors-syntax-string)" },
  { tag: tags.monospace, color: "var(--colors-syntax-addition)" },
  { tag: tags.quote, color: "var(--colors-muted-strong)" },
  { tag: tags.list, color: "var(--colors-syntax-number)" },
  {
    tag: tags.strikethrough,
    color: "var(--colors-muted)",
    textDecoration: "line-through",
  },
  { tag: tags.meta, color: "var(--colors-syntax-comment)" },
  { tag: tags.contentSeparator, color: "var(--colors-syntax-comment)" },
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
