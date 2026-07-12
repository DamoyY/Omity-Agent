import {
  indentUnit,
  syntaxHighlighting,
  HighlightStyle,
} from "@codemirror/language";
import { markdown } from "@codemirror/lang-markdown";
import { EditorState, Prec } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { indentationMarkers } from "@replit/codemirror-indentation-markers";
import CodeMirror from "@uiw/react-codemirror";
import { tags } from "@lezer/highlight";
import { css, cx } from "styled-system/css";

const root = css({
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

const fixedRoot = css({ h: "composerEditor" });

const disabledRoot = css({
  borderColor: "line",
  opacity: 0.65,
});

const bareRoot = css({
  alignSelf: "start",
  borderWidth: "0",
  _focusWithin: { outlineOffset: "-1px" },
});

const codeMirror = css({
  cursor: "text",
});

const fixedCodeMirror = css({ h: "full", "& > .cm-editor": { h: "full" } });

const editorTheme = EditorView.theme(
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
    ".cm-activeLine, .cm-activeLineGutter": {
      backgroundColor: "var(--colors-control)",
    },
    ".cm-cursor, .cm-dropCursor": {
      borderLeftColor: "var(--colors-text)",
    },
    ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": {
      backgroundColor: "var(--colors-line-strong)",
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

const fluidTheme = EditorView.theme({
  "&": { height: "auto" },
  ".cm-content": { minHeight: "2.5rem" },
  ".cm-gutters": { color: "var(--colors-muted-strong)" },
  ".cm-placeholder": { color: "var(--colors-muted-strong)" },
  ".cm-scroller": { overflow: "visible" },
});

const fixedTheme = EditorView.theme({
  "&": { height: "100%" },
  ".cm-content": { minHeight: "100%" },
});

export function MarkdownEditor({
  bare = false,
  disabled,
  fluid = false,
  label,
  onChange,
  onSubmit,
  placeholder,
  value,
}: {
  bare?: boolean;
  disabled: boolean;
  fluid?: boolean;
  label?: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  placeholder: string;
  value: string;
}) {
  return (
    <div
      className={cx(
        root,
        !fluid && fixedRoot,
        bare && bareRoot,
        disabled && disabledRoot,
      )}
    >
      <CodeMirror
        aria-label={label ?? placeholder}
        basicSetup={{
          autocompletion: false,
          foldGutter: false,
          highlightActiveLine: true,
          highlightActiveLineGutter: true,
          lineNumbers: true,
        }}
        className={cx(codeMirror, !fluid && fixedCodeMirror)}
        editable={!disabled}
        extensions={[
          markdown(),
          EditorState.tabSize.of(2),
          indentUnit.of("  "),
          EditorView.lineWrapping,
          indentationMarkers({
            colors: {
              activeDark: "var(--colors-muted-strong)",
              dark: "var(--colors-line-strong)",
            },
            hideFirstIndent: false,
            markerType: "fullScope",
          }),
          syntaxHighlighting(markdownHighlight),
          editorTheme,
          fluid ? fluidTheme : fixedTheme,
          Prec.highest(
            keymap.of([
              {
                key: "Ctrl-Enter",
                run: (view) => {
                  if (view.composing || disabled) return false;
                  onSubmit();
                  return true;
                },
              },
            ]),
          ),
        ]}
        height={fluid ? "auto" : "100%"}
        indentWithTab
        onChange={onChange}
        placeholder={placeholder}
        readOnly={disabled}
        theme="none"
        value={value}
      />
    </div>
  );
}
