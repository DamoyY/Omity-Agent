import type { Components } from "react-markdown";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { css } from "styled-system/css";
import { HighlightedCode } from "./HighlightedCode";
import { Code } from "./ParkUI";

const markdown = css({
  lineHeight: "1.7",
  maxW: "full",
  minW: 0,
  "& p": { mb: "3" },
  "& pre": { mb: "3" },
  "& code": { wordBreak: "break-word" },
  "& ul, & ol": { mb: "3", pl: "5" },
  "& a": { color: "text", textDecoration: "underline" },
  "& table": { borderCollapse: "collapse", w: "full" },
  "& th, & td": { borderWidth: "1px", borderColor: "line", p: "2" },
});

const components: Components = {
  pre: ({ children }) => <>{children}</>,
  code: ({ children, className }) => {
    const raw = String(children);
    const code = raw.replace(/\n$/, "");
    const language = className?.match(/(?:^|\s)language-([^\s]+)/)?.[1];
    if (className || raw.includes("\n")) {
      return <HighlightedCode code={code} language={language} />;
    }
    return (
      <Code size="sm" variant="ghost">
        {children}
      </Code>
    );
  },
};

export function MarkdownView({ content }: { content: string }) {
  return (
    <div className={markdown}>
      <ReactMarkdown components={components} remarkPlugins={[remarkGfm]}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
