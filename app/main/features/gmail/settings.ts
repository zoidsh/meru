import { z } from "zod";

import { labelColorSchema } from "../../../core/records/label-color.ts";
import { msg } from "../../../shared/msg.ts";
import {
  defineSetting,
  defineSettingsPage,
} from "../../../shared/settings/define.ts";

export const gmailPage = defineSettingsPage("gmail", {
  icon: "mail",
  label: msg`Gmail`,
  order: 16,
});

export const gmailSettings = [
  defineSetting("gmail.hideGmailLogo", {
    default: true,
    description: msg`Hide the Gmail logo in the top left corner.`,
    label: msg`Hide Gmail logo`,
    page: gmailPage.id,
    restart: false,
    schema: z.boolean(),
    scope: "global",
    section: msg`Appearance`,
    tier: "free",
  }),
  defineSetting("gmail.hidePromoBanner", {
    default: true,
    description: msg`Hide the promotional banners at the top of the message list, such as the Google Workspace upgrade offer.`,
    label: msg`Hide promotional banner`,
    page: gmailPage.id,
    restart: false,
    schema: z.boolean(),
    scope: "global",
    section: msg`Appearance`,
    tier: "pro",
  }),
  defineSetting("gmail.hideUpgradeButton", {
    default: true,
    description: msg`Hide the Upgrade button in Gmail.`,
    label: msg`Hide upgrade button`,
    page: gmailPage.id,
    restart: false,
    schema: z.boolean(),
    scope: "global",
    section: msg`Appearance`,
    tier: "pro",
  }),
  defineSetting("gmail.reverseConversation", {
    default: false,
    description: msg`Show email conversations in reverse order, with the latest message at the top.`,
    label: msg`Reverse conversation`,
    page: gmailPage.id,
    restart: false,
    schema: z.boolean(),
    scope: "global",
    section: msg`Conversation`,
    tier: "pro",
  }),
  defineSetting("gmail.showTrimmedContent", {
    default: false,
    description: msg`Show the quoted text Gmail hides behind the ••• button.`,
    label: msg`Always show trimmed content`,
    page: gmailPage.id,
    restart: false,
    schema: z.boolean(),
    scope: "global",
    section: msg`Conversation`,
    tier: "pro",
  }),
  defineSetting("gmail.labelColors", {
    default: [],
    label: msg`Label colors`,
    page: gmailPage.id,
    restart: false,
    schema: z.array(labelColorSchema).max(200),
    scope: "global",
    section: msg`Label colors`,
    tier: "pro",
  }),
] as const;
