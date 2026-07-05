import DOMPurify from "dompurify";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { css } from "styled-system/css";
import { Code } from "./ParkUI";

const markdown = css({
  lineHeight: "1.7",
  maxW: "full",
  minW: 0,
  "& p": { mb: "3" },
  "& pre": {
    borderWidth: "1px",
    borderColor: "line",
    maxW: "full",
    overflowX: "auto",
    p: "3",
  },
  "& code": { wordBreak: "break-word" },
  "& ul, & ol": { mb: "3", pl: "5" },
  "& a": { color: "text", textDecoration: "underline" },
  "& table": { borderCollapse: "collapse", w: "full" },
  "& th, & td": { borderWidth: "1px", borderColor: "line", p: "2" },
});

export function MarkdownView({ content }: { content: string }) {
  return (
    <div className={markdown}>
      <ReactMarkdown
        components={{
          code: ({ children }) => (
            <Code size="sm" variant="ghost">
              {children}
            </Code>
          ),
        }}
        remarkPlugins={[remarkGfm]}
      >
        {DOMPurify.sanitize(content)}
      </ReactMarkdown>
    </div>
  );
}
