import type { GmailFeature } from "../feature.ts";
import { hideGmailLogo } from "./hide-gmail-logo.ts";
import { hidePromoBanner } from "./hide-promo-banner.ts";
import { hideUpgradeButton } from "./hide-upgrade-button.ts";
import { labelColors } from "./label-colors.ts";
import { navigate } from "./navigate.ts";
import { needsSignIn } from "./needs-sign-in.ts";
import { reverseConversation } from "./reverse-conversation.ts";
import { showTrimmedContent } from "./show-trimmed-content.ts";
import { urlPreview } from "./url-preview.ts";
import { userStyles } from "./user-styles.ts";

export const gmailFeatures: readonly GmailFeature[] = [
  hideGmailLogo,
  hidePromoBanner,
  hideUpgradeButton,
  labelColors,
  navigate,
  needsSignIn,
  reverseConversation,
  showTrimmedContent,
  urlPreview,
  userStyles,
];
