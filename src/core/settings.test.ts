import { describe, expect, it } from "vitest";
import { z } from "zod/mini";

import {
  SETTINGS,
  decodeSettings,
  readSetting,
  readSettingOf,
  usesReservedName,
  writeSetting,
} from "./settings.ts";
import type { SettingDefinition, Settings } from "./settings.ts";

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
    expect(readSetting(read({ version: 1 }), "design")).toBe("modern");
    expect(readSetting(read({ version: 1 }), "vibrancy")).toBeTruthy();
  });

  it("is the value the file holds", () => {
    const settings = read({ version: 1, design: "classic", vibrancy: false });

    expect(readSetting(settings, "design")).toBe("classic");
    expect(readSetting(settings, "vibrancy")).toBeFalsy();
  });

  it("is the default, in memory, for a value that does not parse", () => {
    const settings = read({ version: 1, design: "glass", vibrancy: "yes" });

    expect(readSetting(settings, "design")).toBe("modern");
    expect(readSetting(settings, "vibrancy")).toBeTruthy();
  });

  it("ignores an override of a global key", () => {
    const settings = read({
      version: 1,
      design: "classic",
      profiles: { p: { design: "modern" } },
    });

    expect(readSetting(settings, "design", "p")).toBe("classic");
  });
});

const PROFILE_SCOPED = {
  density: {
    schema: z.enum(["compact", "roomy"]),
    default: "roomy",
    scope: "profile",
    tier: "free",
    restart: false,
  } as SettingDefinition<"compact" | "roomy">,
};

const withProfiles = (profiles: unknown) =>
  read({ version: 1, density: "compact", profiles });

describe(readSettingOf, () => {
  it("is a profile's override where it has one, and the global value elsewhere", () => {
    const settings = withProfiles({ p: { density: "roomy" } });

    expect(readSettingOf(PROFILE_SCOPED, settings, "density", "p")).toBe(
      "roomy"
    );
    expect(readSettingOf(PROFILE_SCOPED, settings, "density", "q")).toBe(
      "compact"
    );
    expect(readSettingOf(PROFILE_SCOPED, settings, "density")).toBe("compact");
  });

  it("falls back to the global value past an override of any malformed shape", () => {
    for (const profiles of [
      "not a map",
      null,
      [],
      { p: "not an entry" },
      { p: null },
      { p: { density: 3 } },
      { p: {} },
    ]) {
      expect(
        readSettingOf(PROFILE_SCOPED, withProfiles(profiles), "density", "p")
      ).toBe("compact");
    }
  });

  it("falls back to the default when neither the override nor the global value parses", () => {
    const settings = read({
      version: 1,
      density: "huge",
      profiles: { p: { density: "tiny" } },
    });

    expect(readSettingOf(PROFILE_SCOPED, settings, "density", "p")).toBe(
      "roomy"
    );
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
    expect(readSetting(reread, "vibrancy")).toBeFalsy();
    expect(readSetting(reread, "design")).toBe("modern");
  });
});

describe(usesReservedName, () => {
  it("refuses a setting named for the file's version or its profiles", () => {
    expect(usesReservedName({ version: {} })).toBeTruthy();
    expect(usesReservedName({ profiles: {} })).toBeTruthy();
    expect(usesReservedName({ design: {} })).toBeFalsy();
  });

  it("holds for every declared setting", () => {
    expect(usesReservedName(SETTINGS)).toBeFalsy();
  });
});
