import { describe, expect, it } from "vitest";

import {
  OVERRIDABLE_SETTING_KEYS,
  SETTINGS,
  SETTINGS_VERSION,
  clearOverride,
  clearProfileOverrides,
  decodeSettings,
  overridingProfiles,
  readSetting,
  writeOverride,
  writeSetting,
} from "./settings.ts";
import type { SettingDeclarations, Settings } from "./settings.ts";

const read = (value: unknown): Settings => {
  const decoded = decodeSettings(value);

  if (decoded.kind !== "read") {
    throw new Error(decoded.kind);
  }

  return decoded.value;
};

describe(decodeSettings, () => {
  it("reads a file as it was found, unknown keys included", () => {
    const file = { version: 1, trayIconColor: "dark", later: { a: 1 } };

    expect(decodeSettings(file)).toStrictEqual({ kind: "read", value: file });
  });

  it("leaves a newer version to the Meru that wrote it", () => {
    expect(decodeSettings({ version: 2, trayIconColor: [] })).toStrictEqual({
      kind: "newer",
      version: 2,
    });
  });

  it("cannot read garbage, a version below 1 or no Meru's, or a top level that is no object", () => {
    for (const value of [
      undefined,
      null,
      "settings",
      [],
      { trayIconColor: "dark" },
      { version: 0 },
      { version: -1 },
      { version: 1.5 },
      { version: "1" },
    ]) {
      expect(decodeSettings(value).kind).toBe("unreadable");
    }
  });
});

describe(readSetting, () => {
  it("is the default for a key the file does not hold", () => {
    expect(readSetting(read({ version: 1 }), "trayIconColor", "darwin")).toBe(
      "system"
    );
    expect(
      readSetting(read({ version: 1 }), "unreadBadge", "darwin")
    ).toBeTruthy();
  });

  it("shows the tray by default everywhere but on macOS", () => {
    const settings = read({ version: 1 });

    expect(readSetting(settings, "tray", "darwin")).toBeFalsy();
    expect(readSetting(settings, "tray", "win32")).toBeTruthy();
    expect(readSetting(settings, "tray", "linux")).toBeTruthy();
  });

  it("holds a tray choice the file holds on every platform", () => {
    const settings = read({ version: 1, tray: true });

    expect(readSetting(settings, "tray", "darwin")).toBeTruthy();
    expect(
      readSetting(read({ version: 1, tray: false }), "tray", "linux")
    ).toBeFalsy();
  });

  it("follows the system's theme and tints with the profile's color by default, and reads a choice the file holds", () => {
    const defaults = read({ version: 1 });
    const chosen = read({
      version: 1,
      theme: "dark",
      profileTint: false,
      profileTintStrength: "high",
    });
    const broken = read({
      version: 1,
      theme: "sepia",
      profileTint: "no",
      profileTintStrength: 28,
    });

    expect(
      [defaults, chosen, broken].map((settings) => [
        readSetting(settings, "theme", "linux"),
        readSetting(settings, "profileTint", "linux"),
        readSetting(settings, "profileTintStrength", "linux"),
      ])
    ).toStrictEqual([
      ["system", true, "medium"],
      ["dark", false, "high"],
      ["system", true, "medium"],
    ]);
  });

  it("shows every titlebar button by default, and hides one the file turns off", () => {
    const keys = [
      "titlebarNewTab",
      "titlebarUnifiedInbox",
      "titlebarDownloads",
      "titlebarDoNotDisturb",
    ] as const;
    const off = read({ version: 1, titlebarDownloads: false });

    expect(
      keys.map((key) => [
        readSetting(read({ version: 1 }), key, "win32"),
        readSetting(off, key, "win32"),
      ])
    ).toStrictEqual([
      [true, true],
      [true, true],
      [true, false],
      [true, true],
    ]);
  });

  it("shows notifications with the sender, subject and summary by default", () => {
    for (const key of [
      "notifications",
      "notificationSender",
      "notificationSubject",
      "notificationSummary",
    ] as const) {
      expect(readSetting(read({ version: 1 }), key, "darwin")).toBeTruthy();
    }
  });

  it("plays Linen at full volume by default, and reads any other choice the file holds", () => {
    const defaults = read({ version: 1 });

    expect(readSetting(defaults, "notificationSound", "linux")).toBe("linen");
    expect(readSetting(defaults, "notificationSoundVolume", "linux")).toBe(1);

    const chosen = read({
      version: 1,
      notificationSound: "none",
      notificationSoundVolume: 0.05,
    });

    expect(readSetting(chosen, "notificationSound", "linux")).toBe("none");
    expect(readSetting(chosen, "notificationSoundVolume", "linux")).toBe(0.05);
    expect(
      readSetting(
        read({ version: 1, notificationSound: "system" }),
        "notificationSound",
        "linux"
      )
    ).toBe("system");
  });

  it("reads an unknown sound, and a volume out of range or not finite, as the default", () => {
    for (const file of [
      '{ "version": 1, "notificationSound": "bell", "notificationSoundVolume": 0 }',
      '{ "version": 1, "notificationSound": null, "notificationSoundVolume": 1.5 }',
      '{ "version": 1, "notificationSoundVolume": 1e999 }',
      '{ "version": 1, "notificationSoundVolume": -1e999 }',
      '{ "version": 1, "notificationSoundVolume": "0.5" }',
    ]) {
      const settings = read(JSON.parse(file));

      expect(readSetting(settings, "notificationSound", "darwin")).toBe(
        "linen"
      );
      expect(readSetting(settings, "notificationSoundVolume", "darwin")).toBe(
        1
      );
    }
  });

  it("is the value the file holds", () => {
    const settings = read({
      version: 1,
      trayIconColor: "dark",
      unreadBadge: false,
    });

    expect(readSetting(settings, "trayIconColor", "darwin")).toBe("dark");
    expect(readSetting(settings, "unreadBadge", "darwin")).toBeFalsy();
  });

  it("is the default, in memory, for a value that does not parse", () => {
    const settings = read({
      version: 1,
      trayIconColor: "glass",
      unreadBadge: "yes",
    });

    expect(readSetting(settings, "trayIconColor", "darwin")).toBe("system");
    expect(readSetting(settings, "unreadBadge", "darwin")).toBeTruthy();
  });

  it("reads a downloads folder that is not an absolute path as none chosen, and keeps it in the file", () => {
    const folders = [
      "/Users/example/Mail",
      String.raw`C:\Users\example\Mail`,
      "D:/Mail",
      String.raw`\\server\share\Mail`,
      "Mail",
      "./Mail",
      "",
    ];

    expect(
      folders.map((downloadsFolder) =>
        readSetting(
          read({ version: 1, downloadsFolder }),
          "downloadsFolder",
          "darwin"
        )
      )
    ).toStrictEqual([
      "/Users/example/Mail",
      String.raw`C:\Users\example\Mail`,
      "D:/Mail",
      String.raw`\\server\share\Mail`,
      null,
      null,
      null,
    ]);
    expect(read({ version: 1, downloadsFolder: "Mail" })).toStrictEqual({
      version: 1,
      downloadsFolder: "Mail",
    });
  });

  it("ignores a profile's override", () => {
    const settings = read({
      version: 1,
      trayIconColor: "dark",
      profiles: { p: { trayIconColor: "light" } },
    });

    expect(readSetting(settings, "trayIconColor", "darwin")).toBe("dark");
  });
});

describe("a profile's overrides", () => {
  it("are allowed for the notification, badge, Unified inbox, downloads folder and Google apps settings alone", () => {
    expect(OVERRIDABLE_SETTING_KEYS).toStrictEqual([
      "notifications",
      "notificationSender",
      "notificationSubject",
      "notificationSummary",
      "notificationImportantOnly",
      "quietHours",
      "notificationSound",
      "downloadsFolder",
      "unreadBadge",
      "unifiedInbox",
      "openAppsInMeru",
      "appsInDefaultBrowser",
    ]);
  });

  it("lists every profile's mail in the Unified inbox by default", () => {
    expect(
      readSetting(read({ version: 1 }), "unifiedInbox", "darwin")
    ).toBeTruthy();
  });

  it("are read for that profile, where they parse, and the app value otherwise", () => {
    const settings = read({
      version: 1,
      notifications: false,
      notificationSound: "chime",
      profiles: {
        p: { notifications: true, notificationSound: "kazoo" },
        q: "not an entry",
      },
    });

    expect(readSetting(settings, "notifications", "darwin", "p")).toBeTruthy();
    expect(readSetting(settings, "notifications", "darwin")).toBeFalsy();
    expect(
      readSetting(settings, "notifications", "darwin", "other")
    ).toBeFalsy();
    expect(readSetting(settings, "notifications", "darwin", "q")).toBeFalsy();
    expect(readSetting(settings, "notificationSound", "darwin", "p")).toBe(
      "chime"
    );
  });

  it("are not read for an app-only setting", () => {
    const settings = read({
      version: 1,
      trayIconColor: "dark",
      profiles: { p: { trayIconColor: "light" } },
    });

    expect(readSetting(settings, "trayIconColor", "darwin", "p")).toBe("dark");
  });

  it("read as absent under a profiles that is no object, or an inherited name", () => {
    for (const profiles of ["all", [{ notifications: false }], null, 3]) {
      const settings = read({ version: 1, profiles });

      expect(
        readSetting(settings, "notifications", "darwin", "0")
      ).toBeTruthy();
    }

    expect(
      readSetting(
        read({ version: 1, profiles: {} }),
        "notifications",
        "darwin",
        "toString"
      )
    ).toBeTruthy();
  });

  it("replace the app's quiet hours whole, an empty list included", () => {
    const settings = read({
      version: 1,
      quietHours: [{ start: "22:00", end: "07:00" }],
      profiles: {
        p: { quietHours: [{ start: "12:00", end: "13:00", days: [1] }] },
        q: { quietHours: [] },
      },
    });

    expect(readSetting(settings, "quietHours", "darwin", "p")).toStrictEqual([
      { start: "12:00", end: "13:00", days: [1] },
    ]);
    expect(readSetting(settings, "quietHours", "darwin", "q")).toStrictEqual(
      []
    );
  });
});

describe(writeOverride, () => {
  it("sets the profile's value, even the app's own, and keeps the rest of the file as found", () => {
    const found = {
      version: 1,
      unreadBadge: true,
      later: { kept: true },
      profiles: { q: { unreadBadge: "yes", later: [1] }, r: "odd" },
    };
    const written = writeOverride(read(found), "p", "unreadBadge", true);

    expect(read(structuredClone(written))).toStrictEqual({
      ...found,
      profiles: { ...found.profiles, p: { unreadBadge: true } },
    });

    const again = writeOverride(written, "q", "unreadBadge", false);

    expect(again.profiles).toStrictEqual({
      q: { unreadBadge: false, later: [1] },
      r: "odd",
      p: { unreadBadge: true },
    });
  });

  it("replaces a profiles or an entry that is no object with one", () => {
    expect(
      writeOverride(
        read({ version: 1, profiles: "all" }),
        "p",
        "notifications",
        false
      )
    ).toStrictEqual({ version: 1, profiles: { p: { notifications: false } } });
    expect(
      writeOverride(
        read({ version: 1, profiles: { p: [1] } }),
        "p",
        "notifications",
        false
      )
    ).toStrictEqual({ version: 1, profiles: { p: { notifications: false } } });
  });
});

describe(clearOverride, () => {
  it("deletes the key, then the entry and profiles once they are empty", () => {
    const settings = read({
      version: 1,
      profiles: {
        p: { notifications: false, unreadBadge: false },
        q: { unreadBadge: false },
      },
    });
    const once = clearOverride(settings, "p", "notifications");
    const twice = clearOverride(once, "p", "unreadBadge");
    const none = clearOverride(twice, "q", "unreadBadge");

    expect(once.profiles).toStrictEqual({
      p: { unreadBadge: false },
      q: { unreadBadge: false },
    });
    expect(twice.profiles).toStrictEqual({ q: { unreadBadge: false } });
    expect(none).toStrictEqual({ version: 1 });
  });

  it("keeps an entry's unknown keys, and leaves a file without the override as found", () => {
    const settings = read({
      version: 1,
      profiles: { p: { notifications: false, later: 1 }, q: "odd" },
    });

    expect(
      clearOverride(settings, "p", "notifications").profiles
    ).toStrictEqual({ p: { later: 1 }, q: "odd" });
    expect(clearOverride(settings, "q", "notifications")).toBe(settings);
    expect(clearOverride(settings, "z", "notifications")).toBe(settings);

    const odd = read({ version: 1, profiles: "all" });

    expect(clearOverride(odd, "p", "notifications")).toBe(odd);
  });
});

describe(clearProfileOverrides, () => {
  it("deletes the profile's entry, whatever it holds, and an empty profiles with it", () => {
    const settings = read({
      version: 1,
      profiles: { p: "odd", q: { unreadBadge: false } },
    });
    const once = clearProfileOverrides(settings, "p");

    expect(once).toStrictEqual({
      version: 1,
      profiles: { q: { unreadBadge: false } },
    });
    expect(clearProfileOverrides(once, "q")).toStrictEqual({ version: 1 });
    expect(clearProfileOverrides(once, "z")).toBe(once);
  });
});

describe(overridingProfiles, () => {
  it("lists the profiles whose override of the key parses", () => {
    const settings = read({
      version: 1,
      profiles: {
        p: { unreadBadge: false },
        q: { unreadBadge: "no" },
        r: { notifications: false },
        s: "odd",
        t: { unreadBadge: true },
      },
    });

    expect(overridingProfiles(settings, "unreadBadge")).toStrictEqual([
      "p",
      "t",
    ]);
    expect(
      overridingProfiles(read({ version: 1, profiles: 3 }), "unreadBadge")
    ).toStrictEqual([]);
  });
});

describe(writeSetting, () => {
  it("writes everything back as found but the key set, which then reads back", () => {
    const malformed = {
      version: 1,
      trayIconColor: "glass",
      unreadBadge: "yes",
      later: { kept: true },
      profiles: { p: "not an entry", q: { trayIconColor: 7, later: [1] } },
    };
    const changed = writeSetting(read(malformed), "unreadBadge", false);
    const reread = read(structuredClone(changed));

    expect(reread).toStrictEqual({ ...malformed, unreadBadge: false });
    expect(readSetting(reread, "unreadBadge", "darwin")).toBeFalsy();
    expect(readSetting(reread, "trayIconColor", "darwin")).toBe("system");
  });
});

describe("setting declarations", () => {
  it("refuses, as a type error, a setting named for the file's version or its profiles", () => {
    const declared = {
      tray: SETTINGS.tray,
      // @ts-expect-error -- `version` is the file's own
      version: SETTINGS.tray,
    } satisfies SettingDeclarations;
    const profiles = {
      // @ts-expect-error -- `profiles` is the file's own
      profiles: SETTINGS.unreadBadge,
    } satisfies SettingDeclarations;

    expect(Object.keys({ ...declared, ...profiles })).toHaveLength(3);
  });
});

describe("the settings file's version", () => {
  it("stays 1", () => {
    expect(
      SETTINGS_VERSION,
      "a store's version never changes: its shape only grows, read leniently (see the comment at the constant)"
    ).toBe(1);
  });
});
