import { describe, expect, it } from "vitest";

import {
  acceleratorOf,
  conflicts,
  glyphs,
  matchShortcut,
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
    expect(resolveBindings(commands, {}, "linux")).toStrictEqual(
      new Map([
        ["stage.splitVertical", "CommandOrControl+D"],
        ["stage.splitHorizontal", "CommandOrControl+Shift+D"],
        ["stage.closePane", "CommandOrControl+W"],
        ["stage.focusNext", null],
      ])
    );
  });

  it("rebinds, unbinds, and keeps the default for a binding that does not parse", () => {
    const resolved = resolveBindings(
      commands,
      {
        "stage.closePane": "nonsense+",
        "stage.focusNext": "ctrl+tab",
        "stage.gone": "CmdOrCtrl+G",
        "stage.splitHorizontal": null,
        "stage.splitVertical": "alt+cmdorctrl+v",
      },
      "linux"
    );
    expect([...resolved]).toStrictEqual([
      ["stage.splitVertical", "CommandOrControl+Alt+V"],
      ["stage.splitHorizontal", null],
      ["stage.closePane", "CommandOrControl+W"],
      ["stage.focusNext", "Control+Tab"],
    ]);
  });

  it("takes a command's macOS default on macOS and its default elsewhere", () => {
    const back = [
      {
        id: "stage.back",
        shortcut: { darwin: "Command+[", default: "Alt+Left" },
      },
    ];
    expect([
      resolveBindings(back, {}, "darwin").get("stage.back"),
      resolveBindings(back, {}, "win32").get("stage.back"),
      resolveBindings(back, { "stage.back": "Alt+B" }, "darwin").get(
        "stage.back"
      ),
    ]).toStrictEqual(["Command+[", "Alt+Left", "Alt+B"]);
  });
});

describe(conflicts, () => {
  it("finds two commands on the keys a platform presses", () => {
    const resolved = resolveBindings(
      commands,
      { "stage.closePane": "Cmd+D", "stage.focusNext": "Ctrl+D" },
      "linux"
    );
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
    expect(
      conflicts(resolveBindings(commands, {}, "linux"), "darwin")
    ).toStrictEqual([]);
  });
});

describe(glyphs, () => {
  it("prints macOS symbols in the order its menus use", () => {
    expect(glyphs("CmdOrCtrl+Alt+Shift+N", "darwin")).toBe("⌥⇧⌘N");
    expect(glyphs("Ctrl+Shift+]", "darwin")).toBe("⌃⇧]");
    expect(glyphs("Escape", "darwin")).toBe("⎋");
  });

  it("names the keys joined by + elsewhere", () => {
    expect(glyphs("CmdOrCtrl+Alt+N", "win32")).toBe("Ctrl+Alt+N");
    expect(glyphs("CmdOrCtrl+Shift+[", "linux")).toBe("Ctrl+Shift+[");
  });

  it("prints nothing for what does not parse", () => {
    expect(glyphs("Hyper+D", "darwin")).toBeUndefined();
  });
});

const press = (
  code: string,
  key: string,
  modifiers: Partial<{
    shift: boolean;
    control: boolean;
    alt: boolean;
    meta: boolean;
  }> = {}
) => ({
  alt: false,
  code,
  control: false,
  key,
  meta: false,
  shift: false,
  type: "keyDown",
  ...modifiers,
});

describe(acceleratorOf, () => {
  it("records the platform's command key as CommandOrControl, by the physical key", () => {
    expect([
      acceleratorOf(press("KeyK", "K", { meta: true, shift: true }), "darwin"),
      acceleratorOf(press("KeyK", "k", { control: true }), "darwin"),
      acceleratorOf(press("KeyN", "ñ", { alt: true, control: true }), "linux"),
      acceleratorOf(press("KeyK", "k", { meta: true }), "win32"),
      acceleratorOf(press("Comma", ",", { meta: true }), "darwin"),
    ]).toStrictEqual([
      "CommandOrControl+Shift+K",
      "Control+K",
      "CommandOrControl+Alt+N",
      "Super+K",
      "CommandOrControl+,",
    ]);
  });

  it("records nothing for a modifier alone or a key typing would press, but takes a function key alone", () => {
    expect([
      acceleratorOf(press("MetaLeft", "Meta", { meta: true }), "darwin"),
      acceleratorOf(press("KeyK", "k"), "darwin"),
      acceleratorOf(press("KeyK", "K", { shift: true }), "darwin"),
      acceleratorOf(press("F5", "F5"), "darwin"),
    ]).toStrictEqual([undefined, undefined, undefined, "F5"]);
  });
});

describe(matchShortcut, () => {
  const bindings = new Map<string, string | null>([
    ["profiles.select2", "CommandOrControl+2"],
    ["stage.splitVertical", "CommandOrControl+Alt+N"],
    ["profiles.next", "CommandOrControl+Shift+]"],
    ["page.close", "Escape"],
    ["stage.closeTab", null],
  ]);

  it("finds the command a key press is bound to on each platform", () => {
    expect(
      matchShortcut(press("Digit2", "2", { meta: true }), bindings, "darwin")
    ).toBe("profiles.select2");
    expect(
      matchShortcut(press("Digit2", "2", { control: true }), bindings, "linux")
    ).toBe("profiles.select2");
    expect(matchShortcut(press("Escape", "Escape"), bindings, "win32")).toBe(
      "page.close"
    );
  });

  it("reads the physical key, whatever character Option or Shift makes of it", () => {
    expect(
      matchShortcut(
        press("KeyN", "˜", { alt: true, meta: true }),
        bindings,
        "darwin"
      )
    ).toBe("stage.splitVertical");
    expect(
      matchShortcut(
        press("BracketRight", "}", { meta: true, shift: true }),
        bindings,
        "darwin"
      )
    ).toBe("profiles.next");
  });

  it("wants exactly the bound modifiers", () => {
    expect(
      matchShortcut(press("Digit2", "2", { control: true }), bindings, "darwin")
    ).toBeUndefined();
    expect(
      matchShortcut(
        press("Digit2", "2", { meta: true, shift: true }),
        bindings,
        "darwin"
      )
    ).toBeUndefined();
    expect(
      matchShortcut(
        press("Escape", "Escape", { shift: true }),
        bindings,
        "darwin"
      )
    ).toBeUndefined();
  });

  it("ignores a release and an unbound command", () => {
    expect(
      matchShortcut(
        { ...press("Digit2", "2", { meta: true }), type: "keyUp" },
        bindings,
        "darwin"
      )
    ).toBeUndefined();
    expect(
      matchShortcut(
        press("KeyW", "W", { meta: true, shift: true }),
        bindings,
        "darwin"
      )
    ).toBeUndefined();
  });
});
