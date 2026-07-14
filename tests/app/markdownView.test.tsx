import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { MarkdownView } from "../../src/app/frontend/components/MarkdownView";
describe("MarkdownView", () => {
  test("按用户输入语义保留段落内的单个换行", () => {
    const html = renderToStaticMarkup(
      <MarkdownView content={"第一行\n第二行"} preserveLineBreaks />,
    );
    expect(html).toContain("第一行<br/>");
    expect(html).toContain("第二行");
  });
  test("默认仍遵循 CommonMark 软换行语义", () => {
    const html = renderToStaticMarkup(<MarkdownView content={"第一行\n第二行"} />);
    expect(html).not.toContain("<br");
  });
});
