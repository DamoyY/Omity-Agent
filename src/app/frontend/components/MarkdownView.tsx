import DOMPurify from "dompurify";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { css } from "styled-system/css";

const markdown = css({
  lineHeight: "1.7",
  "& p": { mb: "3" },
  "& pre": {
    borderWidth: "1px",
    borderColor: "line",
    fontFamily: "mono",
    overflowX: "auto",
    p: "3",
  },
  "& code": { fontFamily: "mono" },
  "& ul, & ol": { pl: "5", mb: "3" },
  "& a": { color: "text", textDecoration: "underline" },
  "& table": { borderCollapse: "collapse", w: "full" },
  "& th, & td": { borderWidth: "1px", borderColor: "line", p: "2" },
});

export function MarkdownView({ content }: { content: string }) {
  return (
    <div className={markdown}>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>
        {DOMPurify.sanitize(content)}
      </ReactMarkdown>
    </div>
  );
}
