import { describe, expect, it } from "vitest";

import { mountGmail, reached, stylesWith } from "../testing.ts";
import trimmedContent from "./fixtures/trimmed-content.html?raw";
import {
  showTrimmedContent,
  showTrimmedContentRules,
} from "./show-trimmed-content.ts";

const classesOf = (declarations: string) =>
  reached(
    showTrimmedContentRules.filter((rule) => rule.declarations === declarations)
  ).map((element) => element.className);

describe(showTrimmedContent.id, () => {
  it("unfolds the quote and takes its toggle away", () => {
    const page = mountGmail({
      features: [showTrimmedContent],
      html: trimmedContent,
      settings: { styles: stylesWith("showTrimmedContent") },
    });

    expect(classesOf("display: block !important;")).toStrictEqual([
      "adL",
      "h5",
    ]);
    expect(classesOf("display: none !important;")).toStrictEqual([
      "ajU",
      "ajV",
    ]);
    expect(page.sheet("showTrimmedContent")).toContain(".adO .adL");
    page.app.dispose();
  });
});
