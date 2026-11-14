import { z } from "zod";

import { msg } from "../../../shared/msg.ts";
import { defineSetting } from "../../../shared/settings/define.ts";

// Two settings rather than one, because the icon is on by default where a closed window has no dock icon to bring it back, and off on macOS, where it does.
export const traySettings = [
  defineSetting("tray.menuBar", {
    default: false,
    description: msg`Show the application icon in the menu bar.`,
    label: msg`Enable menu bar icon`,
    page: "inbox",
    section: msg`Menu bar`,
    platforms: ["darwin"],
    restart: false,
    schema: z.boolean(),
    scope: "global",
    tier: "free",
  }),
  defineSetting("tray.enabled", {
    default: true,
    description: msg`Show the application icon in the system tray.`,
    label: msg`Enable system tray icon`,
    page: "inbox",
    section: msg`System tray`,
    platforms: ["linux", "win32"],
    restart: false,
    schema: z.boolean(),
    scope: "global",
    tier: "free",
  }),
  defineSetting("tray.unreadCount", {
    default: true,
    description: msg`Show an unread count next to the menu bar icon when there are unread emails.`,
    label: msg`Show unread count`,
    page: "inbox",
    section: msg`Menu bar`,
    platforms: ["darwin"],
    restart: false,
    schema: z.boolean(),
    scope: "global",
    tier: "free",
  }),
  defineSetting("tray.iconColor", {
    default: "system",
    description: msg`Choose the color of the system tray icon.`,
    label: msg`Color`,
    options: { dark: msg`Dark`, light: msg`Light`, system: msg`System` },
    page: "inbox",
    section: msg`System tray`,
    platforms: ["linux", "win32"],
    restart: false,
    schema: z.enum(["system", "light", "dark"]),
    scope: "global",
    tier: "free",
  }),
  defineSetting("tray.selectUnread", {
    default: false,
    description: msg`Select the first profile with unread emails when the icon is clicked.`,
    label: msg`Select first unread profile on click`,
    page: "inbox",
    restart: false,
    schema: z.boolean(),
    scope: "global",
    tier: "free",
  }),
] as const;
