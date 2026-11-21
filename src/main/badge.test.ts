import { describe, expect, it } from "vitest";

import type { Platform } from "#core/platform.ts";
import { createInitialSettings } from "#core/settings.ts";
import type { BadgeContent } from "#platform/badge.ts";

import { createUnreadBadge, unreadText } from "./badge.ts";
import { createSettingsStore } from "./settings.ts";

const setup = (platform: Platform = "darwin") => {
  const shown: (BadgeContent | undefined)[] = [];
  let total = 0;
  let enabled = true;

  const badge = createUnreadBadge({
    badge: {
      show: (content) => {
        shown.push(content);
      },
    },
    platform,
    profiles: () => ["a"],
    unread: () => total,
    counted: () => enabled,
  });

  return {
    badge,
    shown,
    texts: () => shown.map((content) => content?.text),
    setTotal: (next: number) => {
      total = next;
      badge.update();
    },
    setEnabled: (next: boolean) => {
      enabled = next;
      badge.update();
    },
  };
};

describe(unreadText, () => {
  it("is the count up to 99, and 99+ past it", () => {
    expect(unreadText(1)).toBe("1");
    expect(unreadText(99)).toBe("99");
    expect(unreadText(100)).toBe("99+");
  });
});

describe(createUnreadBadge, () => {
  it("follows the count, capped, and clears at zero", () => {
    const app = setup();

    app.setTotal(3);
    app.setTotal(3);
    app.setTotal(250);
    app.setTotal(0);

    expect(app.texts()).toStrictEqual(["3", "99+", undefined]);
    expect(app.shown[0]?.description).toBe("3 unread messages");
  });

  it("shows nothing at launch with no unread mail", () => {
    const app = setup();

    app.setTotal(0);

    expect(app.shown).toStrictEqual([]);
  });

  it("clears while the setting is off and comes back with it", () => {
    const app = setup();

    app.setTotal(5);
    app.setEnabled(false);
    app.setTotal(6);
    app.setEnabled(true);

    expect(app.texts()).toStrictEqual(["5", undefined, "6"]);
  });

  it("draws the overlay at both scales on Windows alone", () => {
    const windows = setup("win32");
    const mac = setup("darwin");

    windows.setTotal(1);
    mac.setTotal(1);

    expect(
      windows.shown[0]?.overlay.map((bitmap) => bitmap.width)
    ).toStrictEqual([16, 32]);
    expect(windows.shown[0]?.description).toBe("1 unread message");
    expect(mac.shown[0]?.overlay).toStrictEqual([]);
  });

  it("clears on quit and stays clear, whatever a late poll brings", () => {
    const app = setup();

    app.setTotal(2);
    app.badge.close();
    app.setTotal(7);
    app.setEnabled(true);

    expect(app.texts()).toStrictEqual(["2", undefined]);
  });

  it("leaves out a profile whose own setting keeps it from the badge, and counts it again once that goes", async () => {
    const shown: (BadgeContent | undefined)[] = [];
    const unread: Record<string, number | null> = { a: 3, b: 4, c: null };
    const settings = createSettingsStore({
      initial: createInitialSettings(),
      save: () => Promise.resolve(),
      platform: "darwin",
      log: () => {},
    });
    const badge = createUnreadBadge({
      badge: {
        show: (content) => {
          shown.push(content);
        },
      },
      platform: "darwin",
      profiles: () => Object.keys(unread),
      unread: (profileId) => unread[profileId] ?? null,
      counted: (profileId) => settings.get("unreadBadge", profileId),
    });

    settings.onChange("unreadBadge", badge.update);
    badge.update();
    await settings.setOverride("b", "unreadBadge", false);
    await settings.update("unreadBadge", () => false);
    await settings.setOverride("a", "unreadBadge", true);
    await settings.clearOverride("b", "unreadBadge");
    await settings.update("unreadBadge", () => true);

    expect(shown.map((content) => content?.text)).toStrictEqual([
      "7",
      "3",
      undefined,
      "3",
      "7",
    ]);
  });
});
