import DOMPurify from "dompurify";
import hljs from "highlight.js/lib/common";
import { useRef } from "react";
import { css, cx } from "styled-system/css";
import { CopyButton } from "./Chat/CopyButton";
import { useFollowBottom } from "./TranscriptScroll";

const container = css({
  maxW: "full",
  minW: 0,
  position: "relative",
});

const copyButton = css({
  position: "absolute",
  right: "2",
  top: "2",
  zIndex: "1",
});

const block = css({
  bg: "surfaceInset",
  borderWidth: "1px",
  borderColor: "line",
  color: "text",
  display: "block",
  fontFamily: "mono",
  fontSize: "sm",
  lineHeight: "1.65",
  m: 0,
  maxW: "full",
  minW: 0,
  overflow: "auto",
  p: "3",
  pr: "12",
  whiteSpace: "pre",
  "& .hljs-keyword, & .hljs-selector-tag, & .hljs-built_in": {
    color: "syntaxKeyword",
  },
  "& .hljs-string, & .hljs-regexp, & .hljs-template-variable": {
    color: "syntaxString",
  },
  "& .hljs-number, & .hljs-literal, & .hljs-symbol": {
    color: "syntaxNumber",
  },
  "& .hljs-title, & .hljs-title.function_, & .hljs-title.class_": {
    color: "syntaxTitle",
  },
  "& .hljs-attr, & .hljs-attribute, & .hljs-property": {
    color: "syntaxProperty",
  },
  "& .hljs-comment, & .hljs-quote": {
    color: "syntaxComment",
    fontStyle: "italic",
  },
  "& .hljs-meta, & .hljs-doctag": { color: "syntaxMeta" },
  "& .hljs-deletion": { color: "syntaxDeletion" },
  "& .hljs-addition": { color: "syntaxAddition" },
});

const codeElement = css({
  bg: "transparent",
  color: "inherit",
  display: "block",
  fontFamily: "inherit",
  fontSize: "inherit",
  lineHeight: "inherit",
  minW: "fit-content",
  whiteSpace: "inherit",
});

export function HighlightedCode({
  autoFollow,
  className,
  code,
  language,
}: {
  autoFollow?: boolean;
  className?: string;
  code: string;
  language?: string;
}) {
  const blockRef = useRef<HTMLPreElement>(null);
  const onScroll = useFollowBottom({
    enabled: autoFollow,
    ref: blockRef,
    version: code,
  });

  return (
    <div className={container}>
      <CopyButton className={copyButton} value={code} />
      <pre className={cx(block, className)} ref={blockRef} onScroll={onScroll}>
        <code
          className={codeElement}
          dangerouslySetInnerHTML={{
            __html: DOMPurify.sanitize(highlight(code, language)),
          }}
        />
      </pre>
    </div>
  );
}

function highlight(code: string, language?: string) {
  const normalized = normalizeLanguage(language);
  if (normalized && hljs.getLanguage(normalized)) {
    return hljs.highlight(code, {
      ignoreIllegals: true,
      language: normalized,
    }).value;
  }
  return hljs.highlightAuto(code).value;
}

function normalizeLanguage(language?: string) {
  return language
    ?.replace(/^language-/, "")
    .trim()
    .toLowerCase();
}
