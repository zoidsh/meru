import type { StyleRule } from "../../content/styles.ts";
import { cssFeature } from "../feature.ts";

// Gmail offers the upgrade twice: as its own promotion element, and as a storage row whose action goes to Google One's plans.
export const hideUpgradeButtonRules: readonly StyleRule[] = [
  {
    declarations: "display: none !important;",
    selector: 'div[data-pep-id="global-pep-gmail"]',
  },
  {
    declarations: "display: none !important;",
    selector:
      'span:has(> div > div > div > div > div[data-action-behavior*="one.google.com/dynamic-plans"])',
  },
];

export const hideUpgradeButton = cssFeature({
  id: "hideUpgradeButton",
  rules: hideUpgradeButtonRules,
});
