import { describe, expect, it } from "vitest";

import type { Platform } from "#core/platform.ts";
import { createInitialSettings } from "#core/settings.ts";

import { COMMANDS } from "./commands.ts";
import type { Command } from "./commands.ts";
import { createKeymap } from "./keymap.ts";
import { createSettingsStore } from "./settings.ts";
import {
  googleNote,
  readShortcuts,
  shortcutsEditing,
} from "./shortcuts-page.ts";

const PLATFORMS = ["darwin", "win32", "linux"] as const;

/**
 * The commands no card lists: Do Not Disturb's, which its submenu and the
 * title bar's button run, with no key and no item with an id in the menu.
 */
const isUnlisted = (command: Pick<Command, "id">) =>
  command.id.startsWith("doNotDisturb.");

const read = (platform: Platform) => readShortcuts(platform, "Meru", COMMANDS);

const card = (platform: Platform, title: string) =>
  read(platform).cards.find((each) => each.title === title);

const spoken = (platform: Platform, title: string) =>
  read(platform)
    .cards.flatMap((each) => each.rows)
    .find((row) => row.title === title)?.keys?.spoken;

/** A row as it reads: its title, and its keys' parts with the last's after "to". */
const shown = (row: {
  title: string;
  keys: { parts: string[] } | null;
  to?: { parts: string[] } | null;
}) => [
  row.title,
  row.keys?.parts.join(" ") ?? "None",
  ...(row.to ? [row.to.parts.join(" ")] : []),
];

describe(readShortcuts, () => {
  it.each(PLATFORMS)(
    "on %s lists every titled registry command in a card but Do Not Disturb's, the families once each",
    (platform) => {
      const titles = read(platform).cards.flatMap((each) =>
        each.rows.map((row) => row.title)
      );
      const expected = COMMANDS.filter(
        (command) =>
          command.title() !== "" &&
          !isUnlisted(command) &&
          !/^(?:tab\.pinned|profile\.select)\.\d$/u.test(command.id)
      ).map((command) => command.title());

      expect(titles.toSorted()).toStrictEqual(
        [
          ...expected,
          "Select Pinned Tab 1 to 9",
          "Select Profile 1 to 9",
        ].toSorted()
      );
    }
  );

  it.each(PLATFORMS)(
    "on %s has a card per menu with a command, in the menu bar's order",
    (platform) => {
      expect(read(platform).cards.map((each) => each.title)).toStrictEqual([
        "Meru",
        "Edit",
        "View",
        "Mail",
        "Tabs",
        "Window",
      ]);
    }
  );

  it("lists each menu's commands in its order, with macOS's keys", () => {
    expect(
      ["Meru", "Edit", "View", "Mail", "Tabs", "Window"].map((title) =>
        card("darwin", title)?.rows.map(shown)
      )
    ).toStrictEqual([
      [
        ["Check for Updates…", "None"],
        ["Settings…", "⌘ ,"],
      ],
      [
        ["Find…", "⌃ ⇧ ⌘ F"],
        ["Find Next", "⌃ ⌘ G"],
        ["Find Previous", "⌃ ⇧ ⌘ G"],
      ],
      [
        ["Sidebar", "⌃ ⌘ L"],
        ["Unified Inbox", "⇧ ⌘ I"],
        ["Downloads", "⌃ ⇧ J"],
        ["Back", "⌃ ⌘ ["],
        ["Forward", "⌃ ⌘ ]"],
        ["Reload", "⌃ ⇧ R"],
        ["Stop", "None"],
      ],
      [
        ["Compose", "None"],
        ["Save Current Search", "None"],
        ["Gmail Settings", "⌃ ⌘ ,"],
      ],
      [
        ["New Tab…", "⌘ T"],
        ["Bookmark Tab", "⇧ ⌘ D"],
        ["Select Next Tab", "⌃ ⇥"],
        ["Select Previous Tab", "⌃ ⇧ ⇥"],
        ["Select Pinned Tab 1 to 9", "⌃ ⌥ 1", "⌃ ⌥ 9"],
        ["Sleep Tab", "None"],
        ["Split Right", "⌥ ⌘ N"],
        ["Split Down", "⌥ ⇧ ⌘ N"],
        ["Maximize Pane", "⌃ ⌘ ↩"],
        ["Separate from Split", "None"],
        ["Move to New Window", "⇧ ⌘ N"],
        ["Move to Main Window", "⇧ ⌘ M"],
        ["Pin Tab", "None"],
        ["Open at Launch", "None"],
        ["Close Tab", "⇧ ⌘ W"],
      ],
      [
        ["Select Profile 1 to 9", "⌃ ⌘ 1", "⌃ ⌘ 9"],
        ["Select Next Profile", "⇧ ⌘ ]"],
        ["Select Previous Profile", "⇧ ⌘ ["],
        ["Sleep Profile", "None"],
      ],
    ]);
  });

  it.each(["win32", "linux"] as const)(
    "on %s lists Check for Updates… after Settings… in the Meru card, with no key",
    (platform) => {
      expect(card(platform, "Meru")?.rows.map(shown)).toStrictEqual([
        ["Settings…", "Ctrl ,"],
        ["Check for Updates…", "None"],
      ]);
    }
  );

  it("shows Windows' and Linux's keys, Ctrl and a digit for a profile and none to step through them", () => {
    expect(card("linux", "Window")?.rows.map(shown)).toStrictEqual([
      ["Select Profile 1 to 9", "Ctrl 1", "Ctrl 9"],
      ["Select Next Profile", "None"],
      ["Select Previous Profile", "None"],
      ["Sleep Profile", "None"],
    ]);
    expect(card("win32", "Window")?.rows.map(shown)[0]).toStrictEqual([
      "Select Profile 1 to 9",
      "Ctrl 1",
      "Ctrl 9",
    ]);
    for (const platform of ["win32", "linux"] as const) {
      expect(card(platform, "Tabs")?.rows.map(shown)).toStrictEqual([
        ["New Tab…", "Ctrl T"],
        ["Bookmark Tab", "Ctrl Alt Shift D"],
        ["Select Next Tab", "Ctrl Tab"],
        ["Select Previous Tab", "Ctrl Shift Tab"],
        ["Select Pinned Tab 1 to 9", "Ctrl Alt Shift 1", "Ctrl Alt Shift 9"],
        ["Sleep Tab", "None"],
        ["Split Right", "Ctrl Alt Shift V"],
        ["Split Down", "Ctrl Alt Shift Down"],
        ["Maximize Pane", "Ctrl Alt Shift Enter"],
        ["Separate from Split", "None"],
        ["Move to New Window", "Ctrl Shift N"],
        ["Move to Main Window", "Ctrl Shift M"],
        ["Pin Tab", "None"],
        ["Open at Launch", "None"],
        ["Close Tab", "Ctrl Shift W"],
      ]);
      expect(
        ["Edit", "View", "Mail"].map((title) =>
          card(platform, title)?.rows.map(shown)
        )
      ).toStrictEqual([
        [
          ["Find…", "F3"],
          ["Find Next", "Ctrl F3"],
          ["Find Previous", "Ctrl Shift F3"],
        ],
        [
          ["Sidebar", "Ctrl Alt D"],
          ["Unified Inbox", "Ctrl Shift I"],
          ["Downloads", "Alt Shift J"],
          ["Back", "Ctrl Alt Left"],
          ["Forward", "Ctrl Alt Right"],
          ["Reload", "F5"],
          ["Stop", "None"],
        ],
        [
          ["Compose", "None"],
          ["Save Current Search", "None"],
          ["Gmail Settings", "Ctrl Alt Shift ,"],
        ],
      ]);
    }
  });

  it("says each key's name for a screen reader", () => {
    expect(
      PLATFORMS.map((platform) => [
        spoken(platform, "Find Previous"),
        spoken(platform, "Back"),
        spoken(platform, "Maximize Pane"),
        spoken(platform, "Settings…"),
        spoken(platform, "Split Down"),
      ])
    ).toStrictEqual([
      [
        "Control Shift Command G",
        "Control Command Left Bracket",
        "Control Command Return",
        "Command Comma",
        "Option Shift Command N",
      ],
      [
        "Control Shift F3",
        "Control Alt Left Arrow",
        "Control Alt Shift Enter",
        "Control Comma",
        "Control Alt Shift Down Arrow",
      ],
      [
        "Control Shift F3",
        "Control Alt Left Arrow",
        "Control Alt Shift Enter",
        "Control Comma",
        "Control Alt Shift Down Arrow",
      ],
    ]);
  });

  it("lists the built-in keys this platform binds: Close Window on macOS alone, Minimize on Ctrl+M elsewhere", () => {
    expect(
      PLATFORMS.map((platform) => read(platform).builtIn.map(shown))
    ).toStrictEqual([
      [
        ["Actual Size", "⌘ 0"],
        ["Zoom In", "⌘ +"],
        ["Zoom Out", "⌘ -"],
        ["Toggle Full Screen", "⌃ ⌘ F"],
        ["Minimize", "⌘ M"],
        ["Close Window", "⌘ W"],
        ["Quit Meru", "⌘ Q"],
      ],
      [
        ["Actual Size", "Ctrl 0"],
        ["Zoom In", "Ctrl +"],
        ["Zoom Out", "Ctrl -"],
        ["Toggle Full Screen", "F11"],
        ["Minimize", "Ctrl M"],
        ["Quit Meru", "Ctrl Q"],
      ],
      [
        ["Actual Size", "Ctrl 0"],
        ["Zoom In", "Ctrl +"],
        ["Zoom Out", "Ctrl -"],
        ["Toggle Full Screen", "F11"],
        ["Minimize", "Ctrl M"],
        ["Quit Meru", "Ctrl Q"],
      ],
    ]);
  });
});

describe(googleNote, () => {
  it("names one app, two, or two and others, with the verb agreeing", () => {
    expect(googleNote([])).toBeNull();
    expect(googleNote(["Chat"])).toBe(
      "Chat also uses this key. Meru's shortcut will win."
    );
    expect(googleNote(["Docs", "Slides"])).toBe(
      "Docs and Slides also use this key. Meru's shortcut will win."
    );
    expect(googleNote(["Gmail", "Docs", "Sheets"])).toBe(
      "Gmail, Docs and others also use this key. Meru's shortcut will win."
    );
  });
});

/** The macOS rows with four keys changed, Back's being recorded. */
const setup = async (pro = true) => {
  const settings = createSettingsStore({
    initial: createInitialSettings(),
    save: () => Promise.resolve(),
    platform: "darwin",
    log: () => {},
  });
  const keymap = createKeymap({
    platform: "darwin",
    appName: "Meru",
    commands: COMMANDS,
    settings,
  });

  await keymap.set("tab.reload", "Command+J");
  await keymap.set("tab.find", "Command+Shift+Y");
  await keymap.set("tab.stop", "Command+Alt+K");
  await keymap.set("tab.findNext", "");

  const rows = readShortcuts(
    "darwin",
    "Meru",
    keymap.commands(),
    shortcutsEditing(keymap, "tab.back", pro)
  ).cards.flatMap((each) => each.rows);

  return (title: string) => rows.find((row) => row.title === title);
};

describe(shortcutsEditing, () => {
  it("says what each changed key's default is, and which Google apps share it", async () => {
    const row = await setup();

    expect(row("Reload")).toMatchObject({
      id: "tab.reload",
      keys: { parts: ["⌘", "J"] },
      changed: true,
      note: "The default is ⌃⇧R.",
      google: "Chat also uses this key. Meru's shortcut will win.",
    });
    expect(row("Find…")).toMatchObject({
      changed: true,
      google: "Docs and Slides also use this key. Meru's shortcut will win.",
    });
    expect(row("Stop")).toMatchObject({
      changed: true,
      note: "There's no default.",
      google: null,
    });
    expect(row("Find Next")).toMatchObject({
      keys: null,
      changed: true,
      google: null,
    });
    expect(row("Back")).toMatchObject({
      id: "tab.back",
      changed: false,
      note: null,
      google: null,
    });
  });

  it("offers no range's key, and nothing to change without Meru Pro", async () => {
    expect((await setup())("Select Profile 1 to 9")?.id).toBeNull();
    expect((await setup(false))("Back")?.id).toBeNull();
  });
});
