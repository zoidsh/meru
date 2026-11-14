import type { StyleRule } from "../../content/styles.ts";
import { cssFeature } from "../feature.ts";

// The logo is an image inside a link back to the inbox, two wrappers up from the box that holds the space it takes.
export const hideGmailLogoRules: readonly StyleRule[] = [
  {
    declarations: "display: none !important;",
    selector: 'header div:has(> div > a[href="#inbox"] > img)',
  },
];

export const hideGmailLogo = cssFeature({
  entry: {
    anchor: 'header a[href="#inbox"] > img',
    context: "header",
    id: "hideGmailLogo",
  },
  id: "hideGmailLogo",
  rules: hideGmailLogoRules,
});
