import { z } from "zod";

import { msg } from "../../../shared/msg.ts";
import {
  defineSetting,
  defineSettingsPage,
} from "../../../shared/settings/define.ts";

export const inboxPage = defineSettingsPage("inbox", {
  icon: "inbox",
  label: msg`Inbox`,
  order: 15,
});

export const inboxSettings = [
  defineSetting("inbox.dockBadge", {
    default: true,
    description: msg`Show the unread count of every profile on the app icon in the dock or taskbar.`,
    label: msg`Show unread badge`,
    page: inboxPage.id,
    section: msg`Unread badge`,
    restart: false,
    schema: z.boolean(),
    scope: "global",
    tier: "free",
  }),
  defineSetting("inbox.countUnread", {
    default: true,
    description: msg`Count this profile's unread mail in the badge on the app icon and in the tray.`,
    label: msg`Count unread mail`,
    page: inboxPage.id,
    section: msg`Unread badge`,
    restart: false,
    schema: z.boolean(),
    scope: "profile",
    tier: "free",
  }),
] as const;
