import { describe, expect, it } from "vitest";

import {
  SETTINGS,
  decodeSettings,
  readSetting,
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

  it("ignores a profile's override", () => {
    const settings = read({
      version: 1,
      trayIconColor: "dark",
      profiles: { p: { trayIconColor: "light" } },
    });

    expect(readSetting(settings, "trayIconColor", "darwin")).toBe("dark");
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
