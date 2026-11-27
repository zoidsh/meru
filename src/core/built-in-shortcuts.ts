import type { Platform } from "./platform.ts";

/** A key the application menu binds outside the command registry. */
export type BuiltInShortcutId =
  | "resetZoom"
  | "zoomIn"
  | "zoomOut"
  | "fullScreen"
  | "minimize"
  | "close"
  | "quit";

export interface BuiltInShortcut {
  id: BuiltInShortcutId;
  /** An Electron accelerator per platform; none where the platform has no key. */
  shortcut: Partial<Record<Platform, string>>;
  /**
   * Where the key is an Electron role's own, which the menu gives no
   * accelerator of ours: the role's key on that platform, as Electron's
   * `electron_api_menu_roles.cc` has it, stated here for the page.
   */
  role?: Partial<Record<Platform, true>>;
}

const everywhere = (accelerator: string) => ({
  darwin: accelerator,
  win32: accelerator,
  linux: accelerator,
});

/** In the order the Settings window's Built-in shortcuts lists them. */
export const BUILT_IN_SHORTCUTS: readonly BuiltInShortcut[] = [
  // Items of Meru's own on the zoom roles' keys.
  { id: "resetZoom", shortcut: everywhere("CommandOrControl+0") },
  { id: "zoomIn", shortcut: everywhere("CommandOrControl+Plus") },
  { id: "zoomOut", shortcut: everywhere("CommandOrControl+-") },
  {
    id: "fullScreen",
    shortcut: { darwin: "Control+Command+F", win32: "F11", linux: "F11" },
    role: { darwin: true, win32: true, linux: true },
  },
  {
    id: "minimize",
    shortcut: everywhere("CommandOrControl+M"),
    role: { darwin: true, win32: true, linux: true },
  },
  // The role on macOS alone: elsewhere Close is an item with no key, so
  // Ctrl+W in a page cannot close the window and quit Meru.
  { id: "close", shortcut: { darwin: "Command+W" }, role: { darwin: true } },
  // The role has no key on Windows, so Meru gives Ctrl+Q wherever the key
  // is not macOS's role's.
  {
    id: "quit",
    shortcut: {
      darwin: "CommandOrControl+Q",
      win32: "CommandOrControl+Q",
      linux: "CommandOrControl+Q",
    },
    role: { darwin: true },
  },
];

/** An item of Meru's menus whose key is an Electron role's, not listed on the Shortcuts page. */
export type RoleShortcutId =
  | "undo"
  | "redo"
  | "cut"
  | "copy"
  | "paste"
  | "pasteAndMatchStyle"
  | "selectAll"
  | "hide"
  | "hideOthers";

/**
 * The keys Electron's roles in Meru's menus hold on each platform, as
 * Electron 45's `electron_api_menu_roles.cc` gives them, which no command
 * may take: the Edit menu's, and macOS's Hide items.
 */
export const ROLE_SHORTCUTS: readonly {
  id: RoleShortcutId;
  shortcut: Partial<Record<Platform, string>>;
}[] = [
  { id: "undo", shortcut: everywhere("CommandOrControl+Z") },
  {
    id: "redo",
    shortcut: {
      darwin: "Shift+CommandOrControl+Z",
      win32: "Control+Y",
      linux: "Shift+CommandOrControl+Z",
    },
  },
  { id: "cut", shortcut: everywhere("CommandOrControl+X") },
  { id: "copy", shortcut: everywhere("CommandOrControl+C") },
  { id: "paste", shortcut: everywhere("CommandOrControl+V") },
  {
    id: "pasteAndMatchStyle",
    shortcut: {
      darwin: "Command+Alt+Shift+V",
      win32: "Shift+CommandOrControl+V",
      linux: "Shift+CommandOrControl+V",
    },
  },
  { id: "selectAll", shortcut: everywhere("CommandOrControl+A") },
  { id: "hide", shortcut: { darwin: "Command+H" } },
  { id: "hideOthers", shortcut: { darwin: "Command+Alt+H" } },
];

/**
 * What a page's view hears as Zoom In in place of the table's Plus: `=`,
 * which carries `+`, with Shift or without, since a key event names the key
 * pressed and Plus is no key of its own on most layouts. Not shown on the
 * Shortcuts page, which lists the menu's Plus.
 */
export const ZOOM_IN_KEYS = [
  "CommandOrControl+=",
  "CommandOrControl+Shift+=",
] as const;

/** The accelerator the menu gives the item itself on `platform`, none for a role's own key. */
export const builtInAccelerator = (
  id: BuiltInShortcutId,
  platform: Platform
) => {
  const entry = BUILT_IN_SHORTCUTS.find((candidate) => candidate.id === id);

  return entry?.role?.[platform] ? undefined : entry?.shortcut[platform];
};
