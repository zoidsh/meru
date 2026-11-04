import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import Markdown from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
import { remarkKbd } from "./remark-kbd";

function render(markdown: string) {
  return renderToStaticMarkup(
    createElement(
      Markdown,
      { remarkPlugins: [remarkKbd], rehypePlugins: [rehypeSanitize] },
      markdown,
    ),
  );
}

describe("remarkKbd", () => {
  test("renders a plain key", () => {
    expect(render("Press <kbd>Enter</kbd> to send.")).toBe(
      "<p>Press <kbd>Enter</kbd> to send.</p>",
    );
  });

  test("renders several keys in one line", () => {
    expect(render("Press <kbd>Cmd</kbd>+<kbd>Shift</kbd>+<kbd>F</kbd> to search.")).toBe(
      "<p>Press <kbd>Cmd</kbd>+<kbd>Shift</kbd>+<kbd>F</kbd> to search.</p>",
    );
  });

  test("renders a key inside other markdown", () => {
    expect(render("- **Search** with <kbd>/</kbd>")).toBe(
      "<ul>\n<li><strong>Search</strong> with <kbd>/</kbd></li>\n</ul>",
    );
  });

  test("leaves a kbd with attributes alone", () => {
    expect(render('Press <kbd class="x">Enter</kbd>.')).toBe("<p>Press Enter.</p>");
  });

  test("leaves an unclosed kbd alone", () => {
    expect(render("Press <kbd>Enter to send.")).toBe("<p>Press Enter to send.</p>");

    expect(render("Press <kbd>Alt</kdb> to show the menu.")).toBe(
      "<p>Press Alt to show the menu.</p>",
    );
  });

  test("leaves a kbd with markup inside alone", () => {
    expect(render("Press <kbd><b>Enter</b></kbd>.")).toBe("<p>Press Enter.</p>");

    expect(render("Press <kbd>**Enter**</kbd>.")).toBe("<p>Press <strong>Enter</strong>.</p>");
  });

  test("leaves an empty kbd alone", () => {
    expect(render("Press <kbd></kbd>.")).toBe("<p>Press .</p>");
  });

  test.each([
    ["script", '<script>alert("x")</script>'],
    ["img", '<img src="https://attacker.example/pixel.png">'],
    ["iframe", '<iframe src="https://attacker.example"></iframe>'],
    ["details", "<details><summary>x</summary>y</details>"],
  ])("renders no %s element", (tagName, html) => {
    for (const markdown of [html, `Inline ${html} HTML.`]) {
      expect(render(markdown)).not.toContain(`<${tagName}`);
    }
  });
});
