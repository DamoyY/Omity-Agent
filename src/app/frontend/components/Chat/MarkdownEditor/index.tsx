import { indentUnit } from "@codemirror/language";
import { markdown } from "@codemirror/lang-markdown";
import { EditorState, Prec } from "@codemirror/state";
import { EditorView, keymap, type KeyBinding } from "@codemirror/view";
import { indentationMarkers } from "@replit/codemirror-indentation-markers";
import CodeMirror from "@uiw/react-codemirror";
import { cx } from "styled-system/css";
import type { HistoryDirection } from "../Composer/history";
import {
  bareRoot,
  codeMirror,
  disabledRoot,
  editorTheme,
  fixedCodeMirror,
  fixedRoot,
  fixedTheme,
  fluidTheme,
  markdownSyntax,
  root,
} from "./theme";

function historyBinding(
  key: "ArrowDown" | "ArrowUp",
  direction: HistoryDirection,
  disabled: boolean,
  navigate?: (direction: HistoryDirection) => string | undefined,
): KeyBinding {
  return {
    key,
    run: (view) => {
      if (view.composing || disabled || !navigate) return false;
      const selection = view.state.selection.main;
      if (!selection.empty) return false;
      const atStart = selection.head === 0;
      const atEnd = selection.head === view.state.doc.length;
      if (direction === "previous" ? !atStart && !atEnd : !atEnd) return false;
      const nextValue = navigate(direction);
      if (nextValue === undefined) return false;
      view.dispatch({
        changes: {
          from: 0,
          to: view.state.doc.length,
          insert: nextValue,
        },
        scrollIntoView: true,
        selection: { anchor: nextValue.length },
      });
      return true;
    },
  };
}

export function MarkdownEditor({
  bare = false,
  disabled,
  fluid = false,
  label,
  onChange,
  onPasteFiles,
  onHistoryNavigate,
  onSubmit,
  placeholder,
  value,
}: {
  bare?: boolean;
  disabled: boolean;
  fluid?: boolean;
  label?: string;
  onChange: (value: string) => void;
  onPasteFiles?: (files: File[]) => string | undefined;
  onHistoryNavigate?: (direction: HistoryDirection) => string | undefined;
  onSubmit: () => void;
  placeholder: string;
  value: string;
}) {
  return (
    <div className={cx(root, !fluid && fixedRoot, bare && bareRoot, disabled && disabledRoot)}>
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
          markdownSyntax,
          editorTheme,
          fluid ? fluidTheme : fixedTheme,
          EditorView.domEventHandlers({
            paste: (event, view) => {
              if (disabled || !onPasteFiles) return false;
              const files = [...(event.clipboardData?.files ?? [])];
              if (files.length === 0) return false;
              event.preventDefault();
              const insert = onPasteFiles(files);
              if (!insert) return true;
              const selection = view.state.selection.main;
              const before = view.state.doc.sliceString(0, selection.from);
              const after = view.state.doc.sliceString(selection.to);
              const text =
                (before && !before.endsWith("\n") ? "\n" : "") +
                insert +
                (after && !after.startsWith("\n") ? "\n" : "");
              view.dispatch({
                changes: {
                  from: selection.from,
                  to: selection.to,
                  insert: text,
                },
                selection: { anchor: selection.from + text.length },
              });
              return true;
            },
          }),
          Prec.highest(
            keymap.of([
              historyBinding("ArrowUp", "previous", disabled, onHistoryNavigate),
              historyBinding("ArrowDown", "next", disabled, onHistoryNavigate),
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
