import ReactMarkdown, { type Components } from "react-markdown";
import { type ReactNode, createElement } from "react";
import { Code } from "./ParkUI";
import { HighlightedCode } from "./HighlightedCode";
import { css } from "styled-system/css";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";

const markdown = css({
  "& .task-list-item": { listStyleType: "none" },
  "& .task-list-item > input": { mr: "2", verticalAlign: "middle" },
  "& > :first-child": { mt: 0 },
  "& > :last-child": { mb: 0 },
  "& a": {
    _hover: { color: "text" },
    color: "syntaxMeta",
    textDecoration: "underline",
    textUnderlineOffset: "0.15em",
  },
  "& blockquote": {
    borderLeftColor: "lineStrong",
    borderLeftWidth: "3px",
    color: "mutedStrong",
    mb: "3",
    pl: "3",
  },
  "& blockquote > :last-child": { mb: 0 },
  "& code": { wordBreak: "break-word" },
  "& h1": { fontSize: "xl" },
  "& h1, & h2, & h3, & h4, & h5, & h6": {
    fontWeight: "bold",
    lineHeight: "1.35",
    mb: "3",
    mt: "5",
  },
  "& h2": { fontSize: "lg" },
  "& h3": { fontSize: "md" },
  "& h4, & h5, & h6": { fontSize: "sm" },
  "& hr": { borderColor: "lineStrong", borderTopWidth: "1px", my: "4" },
  "& img": {
    borderColor: "line",
    borderWidth: "1px",
    display: "block",
    h: "auto",
    maxW: "full",
    mb: "3",
  },
  "& li > ol, & li > ul": { mb: 0, mt: "1" },
  "& li::marker": { color: "mutedStrong" },
  "& ol": { listStyleType: "decimal", mb: "3", pl: "5" },
  "& p": { mb: "3" },
  "& pre": { mb: "3" },
  "& table": { borderCollapse: "collapse", minW: "max-content", w: "full" },
  "& th": { bg: "surfaceInset", fontWeight: "bold", textAlign: "left" },
  "& th, & td": {
    borderColor: "line",
    borderWidth: "1px",
    p: "2",
    verticalAlign: "top",
  },
  "& ul": { listStyleType: "disc", mb: "3", pl: "5" },
  "& ul.contains-task-list": { listStyleType: "none", pl: 0 },
  lineHeight: "1.7",
  maxW: "full",
  minW: 0,
  w: "full",
});
const tableScroll = css({
  maxW: "full",
  mb: "3",
  overflowX: "auto",
  overscrollBehaviorX: "contain",
  w: "full",
});
const inlineCode = css({
  display: "inline",
  fontSize: "sm",
  lineHeight: "1.25",
  px: "1.5",
  py: "0.5",
  verticalAlign: "baseline",
});
const remarkPlugins = [remarkGfm];
const remarkPluginsWithBreaks = [remarkGfm, remarkBreaks];
const components: Components = {
  a: ({ node: _node, ...props }) =>
    createElement("a", { ...props, rel: "noopener noreferrer", target: "_blank" }),
  code: ({ children, className }) => {
    const raw = codeText(children);
    const code = raw.replace(/\n$/, "");
    const language = className?.match(/(?:^|\s)language-(?<language>[^\s]+)/)?.groups?.["language"];
    if (className || raw.includes("\n")) {
      return <HighlightedCode code={code} language={language} />;
    }
    return (
      <Code className={inlineCode} size="md" variant="ghost">
        {children}
      </Code>
    );
  },
  pre: ({ children }) => <>{children}</>,
  table: ({ node: _node, ...props }) => (
    <div className={tableScroll}>{createElement("table", props)}</div>
  ),
};
function codeText(value: ReactNode): string {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "bigint") {
    return value.toString();
  }
  if (Array.isArray(value)) {
    return value.map(codeText).join("");
  }
  return "";
}
export function MarkdownView({
  content,
  preserveLineBreaks = false,
}: {
  content: string;
  preserveLineBreaks?: boolean;
}) {
  return (
    <div className={markdown}>
      <ReactMarkdown
        components={components}
        remarkPlugins={preserveLineBreaks ? remarkPluginsWithBreaks : remarkPlugins}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
