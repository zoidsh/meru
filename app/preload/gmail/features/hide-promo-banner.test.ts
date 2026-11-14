import { describe, expect, it } from "vitest";

import { mountGmail, reached, stylesWith } from "../testing.ts";
import promoBanner from "./fixtures/promo-banner.html?raw";
import { hidePromoBanner, hidePromoBannerRules } from "./hide-promo-banner.ts";

describe(hidePromoBanner.id, () => {
  it("reaches the banner holding the onramp and leaves Gmail's other banners", () => {
    const page = mountGmail({
      features: [hidePromoBanner],
      html: promoBanner,
      settings: { styles: stylesWith("hidePromoBanner") },
    });

    const found = reached(hidePromoBannerRules);
    expect(found).toHaveLength(1);
    expect(
      found[0]?.querySelector("[data-rp-onramp-container]")
    ).not.toBeNull();
    expect(page.sheet("hidePromoBanner")).toContain("display: none !important");
    page.app.dispose();
  });
});
