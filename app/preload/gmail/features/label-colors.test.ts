import { describe, expect, it } from "vitest";

import type { LabelColor } from "../../../core/records/label-color.ts";
import { cssOf } from "../../content/styles.ts";
import { mountGmail, reached } from "../testing.ts";
import labels from "./fixtures/labels.html?raw";
import { labelColorRules, labelColors, quoteLabel } from "./label-colors.ts";

const work: LabelColor = {
  color: "#ff0000",
  label: "Work",
  textColor: "auto",
};
const home: LabelColor = {
  color: "rgb(0, 0, 255)",
  label: "Home",
  textColor: "white",
};

describe(labelColors.id, () => {
  it("colours a label everywhere Gmail draws it", () => {
    const page = mountGmail({
      features: [labelColors],
      html: labels,
      settings: { labelColors: [work, home] },
    });

    const found = reached(labelColorRules([work]));
    expect(
      found.map((element) => element.className || element.tagName)
    ).toStrictEqual(["at", "av", "hN", "aEe"]);

    const sheet = page.sheet("labelColors") ?? "";
    expect(sheet).toContain("background-color: #ff0000 !important;");
    expect(sheet).toContain("contrast-color(#ff0000)");
    expect(sheet).toContain("color: #ffffff !important;");
    page.app.dispose();
  });

  it("follows a change to the colours while the page stays up", () => {
    const page = mountGmail({
      features: [labelColors],
      html: labels,
      settings: { labelColors: [work] },
    });

    page.change({ labelColors: [{ ...work, color: "#00ff00" }] });

    expect(page.sheet("labelColors")).toContain("#00ff00");
    page.change({ labelColors: [] });
    expect(page.sheet("labelColors")).toBeUndefined();
    page.app.dispose();
  });
});

describe(quoteLabel, () => {
  it("keeps a label's own quotes and backslashes inside the string", () => {
    expect(quoteLabel('a"b')).toBe('a\\"b');
    expect(quoteLabel("a\\b")).toBe("a\\\\b");
    expect(quoteLabel("a\r\nb")).toBe("a\\D \\A b");
  });

  it("gives a label that tries to end the rule no selector of its own", () => {
    const hostile: LabelColor = {
      color: "#ff0000",
      label: '"] * { display: none } .at[title="',
      textColor: "auto",
    };

    const css = cssOf(labelColorRules([hostile]));

    expect(css.split("\n")).toHaveLength(labelColorRules([hostile]).length);
    expect(css).toContain(
      '.at[title="\\"] * { display: none } .at[title=\\""]'
    );
  });
});
