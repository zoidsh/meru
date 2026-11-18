import { describe, expect, it } from "vitest";

import { formatAccelerator, matchesAccelerator } from "./accelerator.ts";
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
  isAutoRepeat: false,
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
        "CommandOrControl+Shift+,",
        press("<", "Comma", { meta: true, shift: true }),
        true
      )
    ).toBeTruthy();
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

  it("matches a digit by where it is, since Shift types its symbol", () => {
    expect(
      matchesAccelerator(
        "Control+Shift+2",
        press("@", "Digit2", { control: true, shift: true }),
        true
      )
    ).toBeTruthy();
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

describe(formatAccelerator, () => {
  it("shows macOS's symbols in its order, and names elsewhere", () => {
    expect(
      ["CmdOrCtrl+S", "CommandOrControl+Shift+W", "Ctrl+Shift+Tab"].map(
        (accelerator) => [
          formatAccelerator(accelerator, "darwin"),
          formatAccelerator(accelerator, "win32"),
        ]
      )
    ).toStrictEqual([
      ["⌘S", "Ctrl+S"],
      ["⇧⌘W", "Ctrl+Shift+W"],
      ["⌃⇧⇥", "Ctrl+Shift+Tab"],
    ]);
  });

  it.each([
    ["Alt+Up", "⌥↑", "Alt+Up"],
    ["Alt+Down", "⌥↓", "Alt+Down"],
    ["CmdOrCtrl+Left", "⌘←", "Ctrl+Left"],
    ["CmdOrCtrl+Right", "⌘→", "Ctrl+Right"],
    ["CmdOrCtrl+Backspace", "⌘⌫", "Ctrl+Backspace"],
    ["Shift+Delete", "⇧⌦", "Shift+Delete"],
    ["CmdOrCtrl+Enter", "⌘↩", "Ctrl+Enter"],
    ["Return", "↩", "Return"],
    ["Escape", "⎋", "Escape"],
    ["Esc", "⎋", "Esc"],
    ["Ctrl+Space", "⌃Space", "Ctrl+Space"],
    ["CmdOrCtrl+Plus", "⌘+", "Ctrl++"],
  ])("shows %s as %s on macOS and %s elsewhere", (accelerator, mac, other) => {
    expect([
      formatAccelerator(accelerator, "darwin"),
      formatAccelerator(accelerator, "linux"),
    ]).toStrictEqual([mac, other]);
  });
});
