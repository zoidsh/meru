import { describe, expect, it } from "vitest";

import { paletteColor } from "#core/profile-color.ts";
import { SHELL_GREY } from "#core/shell-grey.ts";
import { createInitialState } from "#core/state.ts";
import type { State } from "#core/state.ts";
import { tonalTokens } from "#core/tonal-tint.ts";

import { wireFrameColors } from "./frame-colors.ts";

/** Home, blue and selected, and Work, amber. */
const STATE: State = {
  ...createInitialState(() => "home"),
  profiles: [
    {
      ...createInitialState(() => "home").profiles[0],
      id: "home",
      name: "Home",
      color: "blue",
    },
    {
      ...createInitialState(() => "work").profiles[0],
      id: "work",
      name: "Work",
      color: "amber",
    },
  ] as State["profiles"],
  selectedProfileId: "home",
};

const shell = (color: Parameters<typeof paletteColor>[0], dark = false) =>
  tonalTokens(paletteColor(color), dark ? "dark" : "light").shell;

const wire = ({ waits = false } = {}) => {
  let isDark = false;
  let tint = true;
  let state = STATE;
  let waiting = waits;
  const choice = Promise.withResolvers<undefined>();
  const listeners: (() => void)[] = [];
  const frame = wireFrameColors({
    theme: {
      isDark: () => isDark,
      onChange: (listener) => {
        listeners.push(listener);
      },
    },
    settings: {
      get: ((key: string) =>
        key === "profileTint" ? tint : undefined) as never,
      onChange: ((_key: string, listener: () => void) => {
        listeners.push(listener);
      }) as never,
    },
    profiles: {
      get: () => state,
      onChange: (listener) => {
        listeners.push(() => {
          listener(state);
        });
      },
    },
    trialChoice: {
      waiting: () => waiting,
      chosen: choice.promise,
    },
  });
  let told = 0;

  frame.onChange(() => {
    told += 1;
  });

  return {
    frame,
    told: () => told,
    change: (next: { dark?: boolean; tint?: boolean; selected?: string }) => {
      isDark = next.dark ?? isDark;
      tint = next.tint ?? tint;
      state = {
        ...state,
        selectedProfileId: next.selected ?? state.selectedProfileId,
      };
      for (const listener of listeners) {
        listener();
      }
    },
    choose: () => {
      waiting = false;
      choice.resolve(undefined);
    },
  };
};

describe(wireFrameColors, () => {
  it("gives the main window the selected profile's tonal shell and an own window its tab's, in the theme", () => {
    const { frame, change } = wire();

    expect([
      frame.mainWindow(),
      frame.ownWindow({ profileId: "work", tabId: "t" }),
    ]).toStrictEqual([shell("blue"), shell("amber")]);

    change({ dark: true, selected: "work" });

    expect([
      frame.mainWindow(),
      frame.ownWindow({ profileId: "home", tabId: "t" }),
    ]).toStrictEqual([shell("amber", true), shell("blue", true)]);
  });

  it("gives every window the grey with the tint off", () => {
    const { frame, change } = wire();

    change({ tint: false });

    expect([
      frame.mainWindow(),
      frame.ownWindow({ profileId: "work", tabId: "t" }),
    ]).toStrictEqual([SHELL_GREY.light, SHELL_GREY.light]);
  });

  it("keeps the main window grey while the trial-ended screen waits, and tells once the person has chosen", async () => {
    const { frame, told, choose } = wire({ waits: true });

    expect(frame.mainWindow()).toBe(SHELL_GREY.light);

    choose();
    await Promise.resolve();
    await Promise.resolve();

    expect([frame.mainWindow(), told()]).toStrictEqual([shell("blue"), 1]);
  });
});
