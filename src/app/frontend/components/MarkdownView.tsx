import { Code } from "./ParkUI";
import type { Components } from "react-markdown";
import { HighlightedCode } from "./HighlightedCode";
import ReactMarkdown from "react-markdown";
import type { ReactNode } from "react";
import { css } from "styled-system/css";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";
const markdown = css({
  "& a": { color: "text", textDecoration: "underline" },
  "& code": { wordBreak: "break-word" },
  "& ol": { listStyleType: "decimal", mb: "3", pl: "5" },
  "& p": { mb: "3" },
  "& pre": { mb: "3" },
  "& table": { borderCollapse: "collapse", w: "full" },
  "& th, & td": { borderColor: "line", borderWidth: "1px", p: "2" },
  "& ul": { listStyleType: "disc", mb: "3", pl: "5" },
  lineHeight: "1.7",
  maxW: "full",
  minW: 0,
});
const inlineCode = css({
  display: "inline",
  fontSize: "sm",
  lineHeight: "1.25",
  px: "1.5",
  py: "0.5",
  verticalAlign: "baseline",
});
const components: Components = {
  a: (props) => <a {...props} rel="noopener noreferrer" target="_blank" />,
  code: ({ children, className }) => {
    const raw = codeText(children);
    const code = raw.replace(/\n$/, "");
    const language = className?.match(/(?:^|\s)language-([^\s]+)/)?.[1];
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
        remarkPlugins={preserveLineBreaks ? [remarkGfm, remarkBreaks] : [remarkGfm]}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
