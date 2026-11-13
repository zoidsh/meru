import { z } from "zod";

import { sidebarWidthSchema } from "../../../core/engines/sidebar.ts";
import { msg } from "../../../shared/msg.ts";
import { defineSetting } from "../../../shared/settings/define.ts";

export const sidebarSettings = [
  defineSetting("sidebar.width", {
    default: "auto",
    description: msg`Narrow shows icons, wide adds titles; auto is wide once an app has more than one tab.`,
    label: msg`Width`,
    page: "sidebar",
    restart: false,
    schema: sidebarWidthSchema,
    scope: "profile",
    tier: "free",
  }),
  defineSetting("sidebar.showWidthToggle", {
    default: true,
    label: msg`Show width button`,
    page: "sidebar",
    restart: false,
    schema: z.boolean(),
    scope: "global",
    tier: "free",
  }),
  defineSetting("sidebar.gmailUnreadBadge", {
    default: "always",
    description: msg`Show the unread count on the Gmail tab. When another tab is active hides it while Gmail is in front, where the inbox already shows it.`,
    label: msg`Show Gmail unread badge`,
    page: "sidebar",
    restart: false,
    schema: z.enum(["always", "whenInactive", "never"]),
    scope: "global",
    tier: "free",
  }),
] as const;
