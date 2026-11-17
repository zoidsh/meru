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
    const file = { version: 1, design: "classic", later: { a: 1 } };

    expect(decodeSettings(file)).toStrictEqual({ kind: "read", value: file });
  });

  it("leaves a newer version to the Meru that wrote it", () => {
    expect(decodeSettings({ version: 2, design: [] })).toStrictEqual({
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
      { design: "classic" },
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
    expect(readSetting(read({ version: 1 }), "design", "darwin")).toBe(
      "modern"
    );
    expect(
      readSetting(read({ version: 1 }), "vibrancy", "darwin")
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

  it("is the value the file holds", () => {
    const settings = read({ version: 1, design: "classic", vibrancy: false });

    expect(readSetting(settings, "design", "darwin")).toBe("classic");
    expect(readSetting(settings, "vibrancy", "darwin")).toBeFalsy();
  });

  it("is the default, in memory, for a value that does not parse", () => {
    const settings = read({ version: 1, design: "glass", vibrancy: "yes" });

    expect(readSetting(settings, "design", "darwin")).toBe("modern");
    expect(readSetting(settings, "vibrancy", "darwin")).toBeTruthy();
  });

  it("ignores a profile's override", () => {
    const settings = read({
      version: 1,
      design: "classic",
      profiles: { p: { design: "modern" } },
    });

    expect(readSetting(settings, "design", "darwin")).toBe("classic");
  });
});

describe(writeSetting, () => {
  it("writes everything back as found but the key set, which then reads back", () => {
    const malformed = {
      version: 1,
      design: "glass",
      vibrancy: "yes",
      later: { kept: true },
      profiles: { p: "not an entry", q: { design: 7, later: [1] } },
    };
    const changed = writeSetting(read(malformed), "vibrancy", false);
    const reread = read(structuredClone(changed));

    expect(reread).toStrictEqual({ ...malformed, vibrancy: false });
    expect(readSetting(reread, "vibrancy", "darwin")).toBeFalsy();
    expect(readSetting(reread, "design", "darwin")).toBe("modern");
  });
});

describe("setting declarations", () => {
  it("refuses, as a type error, a setting named for the file's version or its profiles", () => {
    const declared = {
      design: SETTINGS.design,
      // @ts-expect-error -- `version` is the file's own
      version: SETTINGS.design,
    } satisfies SettingDeclarations;
    const profiles = {
      // @ts-expect-error -- `profiles` is the file's own
      profiles: SETTINGS.vibrancy,
    } satisfies SettingDeclarations;

    expect(Object.keys({ ...declared, ...profiles })).toHaveLength(3);
  });
});
