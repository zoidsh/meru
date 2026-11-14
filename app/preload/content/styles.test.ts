import { describe, expect, it } from "vitest";

import { isHtmlElement, queryAll } from "./query.ts";
import { cssOf, StyleLayers } from "./styles.ts";

const sheets = (): (string | null)[][] =>
  queryAll(document, "style[data-meru-style]", isHtmlElement).map((style) => [
    style.dataset.meruStyle ?? null,
    style.textContent,
  ]);

describe(cssOf, () => {
  it("writes one rule per line", () => {
    expect(
      cssOf([
        { declarations: "display: none !important;", selector: "header" },
        { declarations: "color: red;", selector: ".a, .b" },
      ])
    ).toBe("header { display: none !important; }\n.a, .b { color: red; }");
  });
});

describe(StyleLayers, () => {
  it("keeps one sheet per feature, updates it and takes it down", () => {
    document.head.innerHTML = "";
    const layers = new StyleLayers(document);

    layers.set("labelColors", ".at { color: red; }");
    layers.set("userStyles", "body { zoom: 1; }");
    expect(sheets()).toStrictEqual([
      ["labelColors", ".at { color: red; }"],
      ["userStyles", "body { zoom: 1; }"],
    ]);

    layers.set("labelColors", ".at { color: blue; }");
    expect(sheets()).toStrictEqual([
      ["labelColors", ".at { color: blue; }"],
      ["userStyles", "body { zoom: 1; }"],
    ]);

    layers.set("userStyles", "");
    expect(sheets()).toStrictEqual([["labelColors", ".at { color: blue; }"]]);

    layers.dispose();
    expect(sheets()).toStrictEqual([]);
  });
});
