import { describe, expect, it } from "vitest";

import { mountGmail, reached, stylesWith } from "../testing.ts";
import upgradeButton from "./fixtures/upgrade-button.html?raw";
import {
  hideUpgradeButton,
  hideUpgradeButtonRules,
} from "./hide-upgrade-button.ts";

describe(hideUpgradeButton.id, () => {
  it("reaches both offers and leaves the row that is not one", () => {
    const page = mountGmail({
      features: [hideUpgradeButton],
      html: upgradeButton,
      settings: { styles: stylesWith("hideUpgradeButton") },
    });

    const found = reached(hideUpgradeButtonRules);
    expect(found).toHaveLength(2);
    expect(found.map((element) => element.tagName)).toStrictEqual([
      "DIV",
      "SPAN",
    ]);
    expect(found[1]?.textContent).toContain("Upgrade");
    expect(page.sheet("hideUpgradeButton")).toContain(
      "display: none !important"
    );
    page.app.dispose();
  });
});
