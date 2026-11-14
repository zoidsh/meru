import { describe, expect, expectTypeOf, it } from "vitest";

import { registry } from "./registry.ts";
import type {
  ProfileSettingKey,
  SettingKey,
  SettingValue,
} from "./registry.ts";

describe("the settings registry", () => {
  it("declares each key once", () => {
    const keys = registry.map((entry) => entry.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it.each(registry)("$key has a default its schema accepts", (entry) => {
    expect(entry.schema.safeParse(entry.default).success).toBeTruthy();
  });

  it("lets a profile override only what is about its own page or mail", () => {
    expectTypeOf<ProfileSettingKey>().toEqualTypeOf<
      | "inbox.countUnread"
      | "notifications.enabled"
      | "notifications.newEmails"
      | "sidebar.width"
      | "stage.zoom"
    >();
    expectTypeOf<SettingKey>().toEqualTypeOf<
      | "appearance.style"
      | "inbox.countUnread"
      | "inbox.dockBadge"
      | "launcher.apps"
      | "links.excludedApps"
      | "links.openInApp"
      | "notifications.enabled"
      | "notifications.newEmails"
      | "notifications.playSound"
      | "notifications.showSender"
      | "notifications.showSubject"
      | "notifications.showSummary"
      | "profiles.unreadBadge"
      | "shortcuts.bindings"
      | "sidebar.gmailUnreadBadge"
      | "sidebar.showWidthToggle"
      | "sidebar.width"
      | "stage.zoom"
      | "tray.enabled"
      | "tray.iconColor"
      | "tray.menuBar"
      | "tray.selectUnread"
      | "tray.unreadCount"
      | "updater.channel"
      | "updater.intervalHours"
      | "window.linuxControls"
    >();
    expectTypeOf<SettingValue<"appearance.style">>().toEqualTypeOf<
      "modern" | "classic"
    >();
  });
});
