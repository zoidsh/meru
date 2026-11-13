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

  it("lets a profile override only what is about its own page", () => {
    expectTypeOf<ProfileSettingKey>().toEqualTypeOf<
      "sidebar.width" | "stage.zoom"
    >();
    expectTypeOf<SettingKey>().toEqualTypeOf<
      | "appearance.style"
      | "launcher.apps"
      | "links.excludedApps"
      | "links.mode"
      | "links.openInApp"
      | "profiles.unreadBadge"
      | "shortcuts.bindings"
      | "sidebar.gmailUnreadBadge"
      | "sidebar.showWidthToggle"
      | "sidebar.width"
      | "stage.zoom"
      | "updater.channel"
      | "updater.intervalHours"
      | "window.linuxControls"
    >();
    expectTypeOf<SettingValue<"appearance.style">>().toEqualTypeOf<
      "modern" | "classic"
    >();
  });
});
