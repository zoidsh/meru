import { describe, expect, it } from "vitest";

import { matchesAccelerator } from "./accelerator.ts";
import type { KeyInput } from "./accelerator.ts";

const press = (
  key: string,
  code: string,
  modifiers: Partial<Pick<KeyInput, "control" | "shift" | "alt" | "meta">> = {}
): KeyInput => ({
  type: "keyDown",
  key,
  code,
  control: false,
  shift: false,
  alt: false,
  meta: false,
  ...modifiers,
});

describe(matchesAccelerator, () => {
  it("reads CommandOrControl as Command on macOS and Control elsewhere", () => {
    const commandR = press("r", "KeyR", { meta: true });
    const controlR = press("r", "KeyR", { control: true });

    expect(
      matchesAccelerator("CommandOrControl+R", commandR, true)
    ).toBeTruthy();
    expect(
      matchesAccelerator("CommandOrControl+R", controlR, true)
    ).toBeFalsy();
    expect(
      matchesAccelerator("CommandOrControl+R", controlR, false)
    ).toBeTruthy();
    expect(
      matchesAccelerator("CommandOrControl+R", commandR, false)
    ).toBeFalsy();
  });

  it("wants exactly the accelerator's modifiers", () => {
    const tab = press("Tab", "Tab", { control: true });

    expect(matchesAccelerator("Ctrl+Tab", tab, true)).toBeTruthy();
    expect(
      matchesAccelerator("Ctrl+Tab", { ...tab, shift: true }, true)
    ).toBeFalsy();
    expect(
      matchesAccelerator("Ctrl+Shift+Tab", { ...tab, shift: true }, true)
    ).toBeTruthy();
    expect(
      matchesAccelerator("Ctrl+Tab", press("Tab", "Tab"), true)
    ).toBeFalsy();
  });

  it("matches a shifted key by where it is, and a letter by what it typed", () => {
    expect(
      matchesAccelerator(
        "Command+Shift+]",
        press("}", "BracketRight", { meta: true, shift: true }),
        true
      )
    ).toBeTruthy();
    expect(
      matchesAccelerator(
        "CommandOrControl+Shift+W",
        press("W", "KeyW", { control: true, shift: true }),
        false
      )
    ).toBeTruthy();
    // On AZERTY the key that types w sits where QWERTY has z, and z where
    // QWERTY has w.
    expect(
      matchesAccelerator(
        "CommandOrControl+W",
        press("w", "KeyZ", { meta: true }),
        true
      )
    ).toBeTruthy();
    expect(
      matchesAccelerator(
        "CommandOrControl+W",
        press("z", "KeyW", { meta: true }),
        true
      )
    ).toBeFalsy();
  });

  it("acts on the press alone", () => {
    expect(
      matchesAccelerator(
        "Ctrl+Tab",
        { ...press("Tab", "Tab", { control: true }), type: "keyUp" },
        true
      )
    ).toBeFalsy();
  });
});
