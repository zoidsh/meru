import { describe, expect, it } from "vitest";

import type { Platform } from "#core/platform.ts";

import { COMMANDS } from "./commands.ts";
import { isUnlisted, readShortcuts } from "./shortcuts-page.ts";

const PLATFORMS = ["darwin", "win32", "linux"] as const;

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
      expect(
        COMMANDS.filter(isUnlisted).map((command) => command.id)
      ).toStrictEqual(
        COMMANDS.filter((command) =>
          command.id.startsWith("doNotDisturb.")
        ).map((command) => command.id)
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
      [["Settings…", "⌘ ,"]],
      [
        ["Find…", "⌘ F"],
        ["Find Next", "⌘ G"],
        ["Find Previous", "⇧ ⌘ G"],
      ],
      [
        ["Sidebar", "⌃ ⌘ L"],
        ["Unified Inbox", "⇧ ⌘ I"],
        ["Downloads", "None"],
        ["Back", "⌘ ["],
        ["Forward", "⌘ ]"],
        ["Reload", "⌘ R"],
        ["Stop", "None"],
      ],
      [
        ["Compose", "None"],
        ["Save Current Search", "None"],
        ["Gmail Settings", "⇧ ⌘ ,"],
      ],
      [
        ["New Tab…", "⌘ T"],
        ["Bookmark Tab", "⌘ D"],
        ["Select Next Tab", "⌃ ⇥"],
        ["Select Previous Tab", "⌃ ⇧ ⇥"],
        ["Select Pinned Tab 1 to 9", "⌃ ⇧ 1", "⌃ ⇧ 9"],
        ["Sleep Tab", "None"],
        ["Split Right", "⌥ ⌘ N"],
        ["Split Down", "⌥ ⇧ ⌘ N"],
        ["Maximize Pane", "⇧ ⌘ ↩"],
        ["Separate from Split", "None"],
        ["Move to New Window", "⇧ ⌘ N"],
        ["Move to Main Window", "⇧ ⌘ M"],
        ["Pin Tab", "None"],
        ["Open at Launch", "None"],
        ["Close Tab", "⇧ ⌘ W"],
      ],
      [
        ["Select Profile 1 to 9", "⌘ 1", "⌘ 9"],
        ["Select Next Profile", "⇧ ⌘ ]"],
        ["Select Previous Profile", "⇧ ⌘ ["],
        ["Sleep Profile", "None"],
      ],
    ]);
  });

  it("shows Linux's keys, Alt and a digit for a profile and none to step through them", () => {
    expect(card("linux", "Window")?.rows.map(shown)).toStrictEqual([
      ["Select Profile 1 to 9", "Alt 1", "Alt 9"],
      ["Select Next Profile", "None"],
      ["Select Previous Profile", "None"],
      ["Sleep Profile", "None"],
    ]);
    expect(card("win32", "Window")?.rows.map(shown)[0]).toStrictEqual([
      "Select Profile 1 to 9",
      "Ctrl 1",
      "Ctrl 9",
    ]);
    expect(card("linux", "Tabs")?.rows.map(shown).slice(0, 5)).toStrictEqual([
      ["New Tab…", "Ctrl T"],
      ["Bookmark Tab", "Ctrl D"],
      ["Select Next Tab", "Ctrl Tab"],
      ["Select Previous Tab", "Ctrl Shift Tab"],
      ["Select Pinned Tab 1 to 9", "Ctrl Shift 1", "Ctrl Shift 9"],
    ]);
  });

  it("says each key's name for a screen reader", () => {
    expect(
      PLATFORMS.map((platform) => [
        spoken(platform, "Find Previous"),
        spoken(platform, "Back"),
        spoken(platform, "Maximize Pane"),
        spoken(platform, "Settings…"),
      ])
    ).toStrictEqual([
      [
        "Shift Command G",
        "Command Left Bracket",
        "Shift Command Return",
        "Command Comma",
      ],
      [
        "Control Shift G",
        "Alt Left Arrow",
        "Control Shift Enter",
        "Control Comma",
      ],
      [
        "Control Shift G",
        "Alt Left Arrow",
        "Control Shift Enter",
        "Control Comma",
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
