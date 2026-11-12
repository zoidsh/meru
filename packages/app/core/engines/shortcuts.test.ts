import { describe, expect, it } from "vitest";

import {
  conflicts,
  normalise,
  onPlatform,
  parseAccelerator,
  resolveBindings,
} from "./shortcuts.ts";

describe(parseAccelerator, () => {
  it("reads modifiers and a key in any case and any alias", () => {
    expect(parseAccelerator("cmdorctrl+shift+d")).toStrictEqual({
      key: "D",
      modifiers: ["CommandOrControl", "Shift"],
    });
    expect(parseAccelerator("Shift+Option+F12")).toStrictEqual({
      key: "F12",
      modifiers: ["Alt", "Shift"],
    });
    expect(parseAccelerator("esc")).toStrictEqual({
      key: "Escape",
      modifiers: [],
    });
    expect(parseAccelerator("Ctrl+Plus")).toStrictEqual({
      key: "Plus",
      modifiers: ["Control"],
    });
  });

  it.each([
    "",
    "Shift",
    "Ctrl+",
    "Ctrl+Ctrl+D",
    "Hyper+D",
    "Ctrl+DD",
    "Ctrl+D+Shift",
    "Ctrl++",
    "F25",
  ])("refuses %j", (text) => {
    expect(parseAccelerator(text)).toBeUndefined();
  });
});

describe(normalise, () => {
  it("spells two forms of one accelerator the same", () => {
    expect(normalise("Shift+CmdOrCtrl+d")).toBe("CommandOrControl+Shift+D");
    expect(normalise("CommandOrControl+Shift+D")).toBe(
      "CommandOrControl+Shift+D"
    );
    expect(normalise("Meta+Enter")).toBe("Super+Return");
    expect(normalise("nonsense+")).toBeUndefined();
  });
});

const parsed = (text: string) => {
  const accelerator = parseAccelerator(text);
  if (accelerator === undefined) {
    throw new Error(`${text} does not parse`);
  }
  return accelerator;
};

describe(onPlatform, () => {
  it("presses Command for CommandOrControl on macOS and Control elsewhere", () => {
    expect(onPlatform(parsed("CmdOrCtrl+D"), "darwin").modifiers).toStrictEqual(
      ["Command"]
    );
    expect(onPlatform(parsed("CmdOrCtrl+D"), "linux").modifiers).toStrictEqual([
      "Control",
    ]);
    expect(onPlatform(parsed("Super+Cmd+D"), "darwin").modifiers).toStrictEqual(
      ["Command"]
    );
  });
});

const commands = [
  { id: "stage.splitVertical", shortcut: { default: "CmdOrCtrl+D" } },
  { id: "stage.splitHorizontal", shortcut: { default: "CmdOrCtrl+Shift+D" } },
  { id: "stage.closePane", shortcut: { default: "CmdOrCtrl+W" } },
  { id: "stage.focusNext" },
] as const;

describe(resolveBindings, () => {
  it("takes the default where nothing is bound", () => {
    expect(resolveBindings(commands, {})).toStrictEqual(
      new Map([
        ["stage.splitVertical", "CommandOrControl+D"],
        ["stage.splitHorizontal", "CommandOrControl+Shift+D"],
        ["stage.closePane", "CommandOrControl+W"],
        ["stage.focusNext", null],
      ])
    );
  });

  it("rebinds, unbinds, and keeps the default for a binding that does not parse", () => {
    const resolved = resolveBindings(commands, {
      "stage.closePane": "nonsense+",
      "stage.focusNext": "ctrl+tab",
      "stage.gone": "CmdOrCtrl+G",
      "stage.splitHorizontal": null,
      "stage.splitVertical": "alt+cmdorctrl+v",
    });
    expect([...resolved]).toStrictEqual([
      ["stage.splitVertical", "CommandOrControl+Alt+V"],
      ["stage.splitHorizontal", null],
      ["stage.closePane", "CommandOrControl+W"],
      ["stage.focusNext", "Control+Tab"],
    ]);
  });
});

describe(conflicts, () => {
  it("finds two commands on the keys a platform presses", () => {
    const resolved = resolveBindings(commands, {
      "stage.closePane": "Cmd+D",
      "stage.focusNext": "Ctrl+D",
    });
    expect(conflicts(resolved, "darwin")).toStrictEqual([
      {
        accelerator: "Command+D",
        ids: ["stage.splitVertical", "stage.closePane"],
      },
    ]);
    expect(conflicts(resolved, "linux")).toStrictEqual([
      {
        accelerator: "Control+D",
        ids: ["stage.splitVertical", "stage.focusNext"],
      },
    ]);
    expect(conflicts(resolveBindings(commands, {}), "darwin")).toStrictEqual(
      []
    );
  });
});
