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
  h: "12rem",
  minW: 0,
  overflow: "hidden",
  _focusWithin: {
    outlineColor: "mutedStrong",
    outlineOffset: "2px",
    outlineStyle: "solid",
    outlineWidth: "1px",
  },
});

const disabledRoot = css({
  borderColor: "line",
  opacity: 0.65,
});

const codeMirror = css({
  cursor: "text",
  h: "full",
  "& > .cm-editor": { h: "full" },
});

const editorTheme = EditorView.theme(
  {
    "&": {
      backgroundColor: "var(--colors-surface-inset)",
      color: "var(--colors-text)",
      fontFamily: "var(--fonts-mono)",
      fontSize: "14px",
      height: "100%",
    },
    ".cm-content": {
      caretColor: "var(--colors-text)",
      lineHeight: "1.6",
      minHeight: "100%",
      padding: "10px 0",
    },
    ".cm-gutters": {
      backgroundColor: "var(--colors-surface)",
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

export function MarkdownEditor({
  className,
  disabled,
  onChange,
  onSubmit,
  placeholder,
  value,
}: {
  className?: string;
  disabled: boolean;
  onChange: (value: string) => void;
  onSubmit: () => void;
  placeholder: string;
  value: string;
}) {
  return (
    <div className={cx(root, disabled && disabledRoot, className)}>
      <CodeMirror
        aria-label={placeholder}
        basicSetup={{
          autocompletion: false,
          foldGutter: false,
          highlightActiveLine: true,
          highlightActiveLineGutter: true,
          lineNumbers: true,
        }}
        className={codeMirror}
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
        height="100%"
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
