import { describe, expect, it } from "vitest";

import {
  customShortcutsOf,
  effectiveKeymap,
  shortcutHolder,
  withCustomShortcut,
} from "./keymap.ts";
import type { KeymapInput } from "./keymap.ts";

const DEFAULTS = {
  reload: "Control+Shift+R",
  find: "Control+Shift+Command+F",
  stop: undefined,
  "profile.select.1": "Control+Command+1",
};

const FIXED = [{ id: "quit", accelerator: "Command+Q" }];

const keymapOf = (
  custom: Record<string, string>,
  defaults: KeymapInput["defaults"] = DEFAULTS
) =>
  effectiveKeymap({
    defaults,
    changeable: new Set(
      Object.keys(defaults).filter((id) => !id.startsWith("profile."))
    ),
    custom,
    fixed: FIXED,
    isMacOS: true,
  });

describe(customShortcutsOf, () => {
  it("reads only this platform's set, each key the recorder could have recorded or none", () => {
    const stored = {
      darwin: {
        reload: "Command+R",
        find: "",
        stop: "Shift+R",
        unknownToThisBuild: "Command+K",
        broken: 7,
      },
      win32: { reload: "F6" },
      plan9: { reload: "Control+R" },
    };

    expect([
      customShortcutsOf(stored, "darwin"),
      customShortcutsOf(stored, "win32"),
      customShortcutsOf(stored, "linux"),
      customShortcutsOf({ darwin: "garbage" }, "darwin"),
      customShortcutsOf({ darwin: ["Command+R"] }, "darwin"),
    ]).toStrictEqual([
      { reload: "Command+R", find: "", unknownToThisBuild: "Command+K" },
      { reload: "F6" },
      {},
      {},
      {},
    ]);
  });
});

describe(effectiveKeymap, () => {
  it('lays the person\'s keys over the defaults, `""` leaving none, and ignores an unknown or unchangeable command', () => {
    const keymap = keymapOf({
      reload: "Command+R",
      find: "",
      unknownToThisBuild: "Command+K",
      "profile.select.1": "Command+1",
    });

    expect(keymap.keys).toStrictEqual({
      reload: "Command+R",
      find: undefined,
      stop: undefined,
      "profile.select.1": "Control+Command+1",
    });
    expect([...keymap.changed]).toStrictEqual(["reload", "find"]);
  });

  it("is the defaults with no set, as while the run is not entitled", () => {
    expect(keymapOf({}).keys).toStrictEqual(DEFAULTS);
  });

  it("ignores a key a fixed key holds, or that a default now holds, the command keeping its default", () => {
    // As if a later version had given Stop the key Reload was moved to.
    const keymap = keymapOf(
      { reload: "Command+K", find: "Command+Q" },
      { ...DEFAULTS, stop: "Command+K" }
    );

    expect(keymap.keys).toStrictEqual({
      reload: "Control+Shift+R",
      find: "Control+Shift+Command+F",
      stop: "Command+K",
      "profile.select.1": "Control+Command+1",
    });
    expect(keymap.changed.size).toBe(0);
  });

  it("gives a key two commands' own keys share to the earlier one", () => {
    const keymap = keymapOf({ reload: "Command+K", find: "Command+K" });

    expect([keymap.keys.reload, keymap.keys.find]).toStrictEqual([
      "Command+K",
      "Control+Shift+Command+F",
    ]);
  });

  it("keeps two commands that swapped their keys, and settles a chain where each loss frees or takes the next key", () => {
    const swapped = keymapOf({
      reload: "Control+Shift+Command+F",
      find: "Control+Shift+R",
    });

    expect([swapped.keys.reload, swapped.keys.find]).toStrictEqual([
      "Control+Shift+Command+F",
      "Control+Shift+R",
    ]);

    // A loses its own key to B's new default and falls back to X, which C
    // had taken, so C loses too; read once, or undoing a loss, it would
    // never settle or leave two commands on one key.
    const chain = keymapOf(
      { a: "Command+Y", c: "Command+X" },
      { a: "Command+X", b: "Command+Y", c: "Command+Z" }
    );

    expect(chain.keys).toStrictEqual({
      a: "Command+X",
      b: "Command+Y",
      c: "Command+Z",
    });
    expect(chain.changed.size).toBe(0);
  });
});

describe(shortcutHolder, () => {
  const keymap = keymapOf({ find: "Command+K" });

  it("names the command or the fixed key holding a key, however it is spelled, and none for a free one or the command's own", () => {
    expect([
      shortcutHolder(keymap, FIXED, "reload", "Command+K", true),
      shortcutHolder(keymap, FIXED, "reload", "CmdOrCtrl+Q", true),
      shortcutHolder(keymap, FIXED, "reload", "Command+1", true),
      shortcutHolder(keymap, FIXED, "reload", "Control+Command+1", true),
      shortcutHolder(keymap, FIXED, "find", "Command+K", true),
      shortcutHolder(keymap, FIXED, "reload", "", true),
    ]).toStrictEqual([
      { command: "find" },
      { fixed: "quit" },
      undefined,
      { command: "profile.select.1" },
      undefined,
      undefined,
    ]);
  });
});

describe(withCustomShortcut, () => {
  const stored = {
    darwin: { find: "Command+K", unknownToThisBuild: 7 },
    win32: { reload: "F6" },
    future: true,
  };

  it("sets this platform's key and leaves every other set, and what it cannot read, as found", () => {
    expect(
      withCustomShortcut(
        stored,
        "darwin",
        "reload",
        "Command+R",
        "Control+Shift+R"
      )
    ).toStrictEqual({
      darwin: {
        find: "Command+K",
        unknownToThisBuild: 7,
        reload: "Command+R",
      },
      win32: { reload: "F6" },
      future: true,
    });
  });

  it("removes a key equal to the default, and no key where there is no default, so Reset and typing the default again are one state", () => {
    expect([
      withCustomShortcut(
        stored,
        "darwin",
        "find",
        "Command+Shift+Control+F",
        "Control+Shift+Command+F"
      ),
      withCustomShortcut(
        stored,
        "darwin",
        "find",
        undefined,
        "Control+Shift+Command+F"
      ),
      withCustomShortcut(stored, "darwin", "stop", "", undefined),
      withCustomShortcut(stored, "darwin", "reload", "", "Control+Shift+R"),
    ]).toStrictEqual([
      { ...stored, darwin: { unknownToThisBuild: 7 } },
      { ...stored, darwin: { unknownToThisBuild: 7 } },
      stored,
      { ...stored, darwin: { ...stored.darwin, reload: "" } },
    ]);
  });

  it("drops a set left empty, and starts one where the stored one is not an object", () => {
    expect([
      withCustomShortcut(
        { win32: { reload: "F6" } },
        "win32",
        "reload",
        undefined,
        "F5"
      ),
      withCustomShortcut({ linux: "garbage" }, "linux", "reload", "F6", "F5"),
    ]).toStrictEqual([{}, { linux: { reload: "F6" } }]);
  });
});
