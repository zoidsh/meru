import { z } from "zod";

import {
  gmailUnreadBadgeSchema,
  sidebarWidthSchema,
} from "../../../core/engines/sidebar.ts";
import { msg } from "../../../shared/msg.ts";
import {
  defineSetting,
  defineSettingsPage,
} from "../../../shared/settings/define.ts";

export const sidebarPage = defineSettingsPage("sidebar", {
  label: msg`Sidebar`,
  order: 50,
});

export const sidebarSettings = [
  defineSetting("sidebar.width", {
    default: "auto",
    description: msg`Narrow shows icons, wide adds titles; auto is wide once an app has more than one tab.`,
    label: msg`Width`,
    options: { auto: msg`Automatic`, narrow: msg`Narrow`, wide: msg`Wide` },
    page: sidebarPage.id,
    restart: false,
    schema: sidebarWidthSchema,
    scope: "profile",
    tier: "free",
  }),
  defineSetting("sidebar.showWidthToggle", {
    default: true,
    label: msg`Show width button`,
    page: sidebarPage.id,
    restart: false,
    schema: z.boolean(),
    scope: "global",
    tier: "free",
  }),
  defineSetting("sidebar.gmailUnreadBadge", {
    default: "always",
    description: msg`Show the unread count on the Gmail tab. When another tab is active hides it while Gmail is in front, where the inbox already shows it.`,
    label: msg`Show Gmail unread badge`,
    options: {
      always: msg`Always`,
      never: msg`Never`,
      whenInactive: msg`When inactive`,
    },
    page: sidebarPage.id,
    restart: false,
    schema: gmailUnreadBadgeSchema,
    scope: "global",
    tier: "free",
  }),
] as const;
