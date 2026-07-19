import { describe, expect, test } from "bun:test";
import { MarkdownView } from "../../src/app/frontend/components/MarkdownView";
import { renderToStaticMarkup } from "react-dom/server";

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
  test("链接不透传解析节点并在新窗口安全打开", () => {
    const html = renderToStaticMarkup(<MarkdownView content="[示例](https://example.com/path)" />);
    expect(html).toContain(
      '<a href="https://example.com/path" rel="noopener noreferrer" target="_blank">示例</a>',
    );
    expect(html).not.toContain('node="');
  });
  test("表格具有独立的横向滚动容器", () => {
    const html = renderToStaticMarkup(<MarkdownView content={"| 标题 |\n| --- |\n| 内容 |"} />);
    expect(html).toMatch(/<div class="[^"]+"><table>/);
  });
  test("保留远程 Markdown 图片链接", () => {
    const html = renderToStaticMarkup(
      <MarkdownView content="![预览](https://images.example.com/preview.png)" />,
    );
    expect(html).toContain('<img src="https://images.example.com/preview.png" alt="预览"/>');
  });
});
