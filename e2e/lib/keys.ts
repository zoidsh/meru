type Modifier = "shift" | "control" | "alt" | "meta";

/** A key with its modifiers, as `sendInputEvent` takes them. */
export interface Key {
  keyCode: string;
  modifiers: Modifier[];
}

const isMacOS = process.platform === "darwin";

const key = (keyCode: string, ...modifiers: Modifier[]): Key => ({
  keyCode,
  modifiers,
});

/** Cmd on macOS, Ctrl elsewhere. */
export const COMMAND_KEY: Modifier = isMacOS ? "meta" : "control";

/** The default shortcuts the tests press, as the registry has them on this platform. */
export const KEYS = {
  find: isMacOS ? key("F", "control", "shift", "meta") : key("F3"),
  findNext: isMacOS ? key("G", "control", "meta") : key("F3", "control"),
  findPrevious: isMacOS
    ? key("G", "control", "shift", "meta")
    : key("F3", "control", "shift"),
  reload: isMacOS ? key("R", "control", "shift") : key("F5"),
  bookmark: isMacOS
    ? key("D", "shift", "meta")
    : key("D", "control", "alt", "shift"),
  splitRight: isMacOS
    ? key("N", "alt", "meta")
    : key("V", "control", "alt", "shift"),
  maximize: isMacOS
    ? key("Enter", "control", "meta")
    : key("Enter", "control", "alt", "shift"),
  profile: (position: number) =>
    isMacOS
      ? key(`${position}`, "control", "meta")
      : key(`${position}`, "control"),
  pinned: (position: number) =>
    isMacOS
      ? key(`${position}`, "control", "alt")
      : key(`${position}`, "control", "alt", "shift"),
  newTab: key("T", COMMAND_KEY),
  moveToNewWindow: key("N", COMMAND_KEY, "shift"),
  moveToMainWindow: key("M", COMMAND_KEY, "shift"),
  closeTab: key("W", COMMAND_KEY, "shift"),
  nextTab: key("Tab", "control"),
  zoomIn: key("=", COMMAND_KEY),
  zoomOut: key("-", COMMAND_KEY),
  resetZoom: key("0", COMMAND_KEY),
  escape: key("Escape"),
} as const;

/** The accelerators a menu item carries for the moved keys, as the registry writes them. */
export const ACCELERATORS = isMacOS
  ? {
      reload: "Control+Shift+R",
      bookmark: "Command+Shift+D",
      splitRight: "Command+Alt+N",
      splitDown: "Command+Alt+Shift+N",
      maximize: "Control+Command+Enter",
    }
  : {
      reload: "F5",
      bookmark: "Control+Alt+Shift+D",
      splitRight: "Control+Alt+Shift+V",
      splitDown: "Control+Alt+Shift+Down",
      maximize: "Control+Alt+Shift+Enter",
    };

/**
 * The keys Meru used before the keymap of 26 November 2026 moved them off
 * Google's apps' keys, which now reach the page.
 */
export const FORMER_KEYS = {
  reload: key("R", COMMAND_KEY),
  find: key("F", COMMAND_KEY),
  /** None on Windows, whose key did not move. */
  profile: (position: number) =>
    ({
      darwin: key(`${position}`, "meta"),
      linux: key(`${position}`, "alt"),
    })[process.platform as string],
} as const;
