import { describe, expect, it } from "vitest";

import type { Platform } from "#core/platform.ts";
import { createInitialSettings } from "#core/settings.ts";

import { COMMANDS } from "./commands.ts";
import { createKeymap } from "./keymap.ts";
import { createSettingsStore } from "./settings.ts";

const setup = (platform: Platform = "darwin", stored = {}) => {
  let pro = true;
  const saved: unknown[] = [];
  const settings = createSettingsStore({
    initial: { ...createInitialSettings(), customShortcuts: stored },
    save: (written) => {
      saved.push(written.customShortcuts);

      return Promise.resolve();
    },
    platform,
    log: () => {},
    can: (capability) => pro || capability !== "shortcutCustomization",
  });
  const keymap = createKeymap({
    platform,
    appName: "Meru",
    commands: COMMANDS,
    settings,
  });
  let changes = 0;
  keymap.onChange(() => {
    changes += 1;
  });

  return {
    keymap,
    settings,
    saved,
    changes: () => changes,
    setPro: (next: boolean) => {
      pro = next;
      settings.recheck();
    },
  };
};

const key = (keymap: ReturnType<typeof setup>["keymap"], id: string) =>
  keymap.commands().find((command) => command.id === id)?.shortcut;

describe(createKeymap, () => {
  it("gives every command its default until a person changes one", () => {
    const { keymap } = setup();

    expect(keymap.accelerator("tab.reload")).toBe("Control+Shift+R");
    expect(keymap.commands()).toStrictEqual(COMMANDS);
  });

  it("gives a command the key set, in every list that shows it, and tells", async () => {
    const { keymap, saved, changes } = setup();

    await expect(
      keymap.set("tab.reload", "Command+Alt+R")
    ).resolves.toBeUndefined();

    expect(keymap.accelerator("tab.reload")).toBe("Command+Alt+R");
    expect(key(keymap, "tab.reload")).toStrictEqual({
      darwin: "Command+Alt+R",
      win32: "F5",
      linux: "F5",
    });
    expect(saved).toStrictEqual([
      { darwin: { "tab.reload": "Command+Alt+R" } },
    ]);
    expect(changes()).toBe(1);
  });

  it("clears a key with an empty one, leaving the command with none", async () => {
    const { keymap, saved } = setup();

    await keymap.set("tab.reload", "");

    expect(keymap.accelerator("tab.reload")).toBeUndefined();
    expect(key(keymap, "tab.reload")).toStrictEqual({
      win32: "F5",
      linux: "F5",
    });
    expect(saved).toStrictEqual([{ darwin: { "tab.reload": "" } }]);
  });

  it.each<[string, Platform, string, string]>([
    [
      "another command's",
      "darwin",
      "Command+,",
      "⌘, is already used for Settings.",
    ],
    [
      "a range's",
      "darwin",
      "Control+Command+2",
      "⌃⌘2 is already used for Select Profile 2.",
    ],
    [
      "a built-in's",
      "linux",
      "Control+Q",
      "Ctrl+Q is already used for Quit Meru.",
    ],
    [
      "the Edit menu's",
      "win32",
      "Control+C",
      "Ctrl+C is already used for Copy.",
    ],
    [
      "Zoom In's = key",
      "linux",
      "Control+Shift+=",
      "Ctrl+Shift+= is already used for Zoom In.",
    ],
    [
      "macOS's Hide",
      "darwin",
      "Command+H",
      "⌘H is already used for Hide Meru.",
    ],
  ])(
    "refuses %s key and names its holder, changing nothing",
    async (_kind, platform, accelerator, sentence) => {
      const { keymap, saved, changes } = setup(platform);
      const before = keymap.accelerator("tab.reload");

      await expect(keymap.set("tab.reload", accelerator)).resolves.toBe(
        sentence
      );
      expect(keymap.accelerator("tab.reload")).toBe(before);
      expect(saved).toStrictEqual([]);
      expect(changes()).toBe(0);
    }
  );

  it("hears the same key however it is spelled", async () => {
    const { keymap } = setup("win32");

    await expect(keymap.set("tab.reload", "CommandOrControl+,")).resolves.toBe(
      "Ctrl+, is already used for Settings."
    );
  });

  it("frees the key a command leaves, for another to take", async () => {
    const { keymap } = setup();

    await keymap.set("tab.reload", "Command+Alt+R");

    await expect(
      keymap.set("tab.find", "Control+Shift+R")
    ).resolves.toBeUndefined();
    expect(keymap.accelerator("tab.find")).toBe("Control+Shift+R");
  });

  it("gives the default back on Reset and stores nothing for it", async () => {
    const { keymap, saved } = setup();

    await keymap.set("tab.reload", "Command+Alt+R");

    await expect(keymap.reset("tab.reload")).resolves.toBeUndefined();
    expect(keymap.accelerator("tab.reload")).toBe("Control+Shift+R");
    expect(saved.at(-1)).toStrictEqual({});
  });

  it("refuses Reset while another command holds the default", async () => {
    const { keymap } = setup();

    await keymap.set("tab.reload", "Command+Alt+R");
    await keymap.set("tab.find", "Control+Shift+R");

    await expect(keymap.reset("tab.reload")).resolves.toBe(
      "⌃⇧R is already used for Find."
    );
    expect(keymap.accelerator("tab.reload")).toBe("Command+Alt+R");
  });

  it("changes no range's key", async () => {
    const { keymap } = setup();

    expect(keymap.isChangeable("profile.select.1")).toBeFalsy();
    expect(keymap.isChangeable("tab.reload")).toBeTruthy();
    await expect(
      keymap.set("profile.select.1", "Command+Alt+1")
    ).rejects.toThrow("has no key to change");
  });

  it("applies the stored keys only with Meru Pro, keeping them for a license", async () => {
    const { keymap, setPro, changes } = setup("darwin", {
      darwin: { "tab.reload": "Command+Alt+R" },
    });

    expect(keymap.accelerator("tab.reload")).toBe("Command+Alt+R");

    setPro(false);

    expect(keymap.accelerator("tab.reload")).toBe("Control+Shift+R");
    expect(changes()).toBe(1);
    await expect(keymap.set("tab.reload", "Command+Alt+T")).rejects.toThrow(
      "needs Meru Pro"
    );

    setPro(true);

    expect(keymap.accelerator("tab.reload")).toBe("Command+Alt+R");
  });

  it("reads another platform's keys as none of this one's", () => {
    const { keymap } = setup("linux", {
      darwin: { "tab.reload": "Command+Alt+R" },
    });

    expect(keymap.accelerator("tab.reload")).toBe("F5");
  });
});
