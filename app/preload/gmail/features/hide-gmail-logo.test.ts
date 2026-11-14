import { describe, expect, it } from "vitest";

import { mountGmail, reached, stylesWith } from "../testing.ts";
import header from "./fixtures/header.html?raw";
import { hideGmailLogo, hideGmailLogoRules } from "./hide-gmail-logo.ts";

describe(hideGmailLogo.id, () => {
  it("reaches the box the logo sits in and nothing else of the header", () => {
    const page = mountGmail({
      features: [hideGmailLogo],
      html: header,
      settings: { styles: stylesWith("hideGmailLogo") },
    });

    const found = reached(hideGmailLogoRules);
    expect(found).toHaveLength(1);
    expect(found[0]?.className).toBe("gb_Rd");
    expect(page.sheet("hideGmailLogo")).toContain("display: none !important");

    page.change({ styles: stylesWith() });
    expect(page.sheet("hideGmailLogo")).toBeUndefined();
    page.app.dispose();
  });
});
