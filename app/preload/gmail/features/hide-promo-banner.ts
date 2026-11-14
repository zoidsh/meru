import type { StyleRule } from "../../content/styles.ts";
import { cssFeature } from "../feature.ts";

// Gmail's own banner container, which it also uses for banners that are not the promotion, so the onramp inside it is what tells them apart.
export const hidePromoBannerRules: readonly StyleRule[] = [
  {
    declarations: "display: none !important;",
    selector:
      '[data-elevated-container-view-type="timely_bump"]:has([data-rp-onramp-container])',
  },
];

export const hidePromoBanner = cssFeature({
  id: "hidePromoBanner",
  rules: hidePromoBannerRules,
});
