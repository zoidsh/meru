import { describe, expect, it } from "vitest";

import { silentLog } from "#core/log.fake.ts";
import type { Settings, ThemeChoice } from "#core/settings.ts";

import { createSettingsStore } from "./settings.ts";
import { followThemeSetting } from "./theme.ts";

const setup = (initial: Settings) => {
  const sources: ThemeChoice[] = [];
  const settings = createSettingsStore({
    initial,
    save: () => Promise.resolve(),
    platform: "darwin",
    log: silentLog,
  });

  followThemeSetting({
    theme: {
      setSource: (source) => {
        sources.push(source);
      },
    },
    settings,
  });

  return { sources, settings };
};

describe(followThemeSetting, () => {
  it("follows the system when nothing is stored", () => {
    expect(setup({ version: 1 }).sources).toStrictEqual(["system"]);
  });

  it("applies a stored theme at once, before any window is made", () => {
    expect(setup({ version: 1, theme: "dark" }).sources).toStrictEqual([
      "dark",
    ]);
  });

  it("applies each change as it is saved", async () => {
    const { sources, settings } = setup({ version: 1 });

    await settings.update("theme", () => "light");
    await settings.update("theme", () => "system");

    expect(sources).toStrictEqual(["system", "light", "system"]);
  });

  it("reads a value it does not know as the system's", () => {
    expect(
      setup({ version: 1, theme: "sepia" } as unknown as Settings).sources
    ).toStrictEqual(["system"]);
  });
});
