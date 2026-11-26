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
  // The role has no key on Windows, so Meru gives Ctrl+Q wherever it is not
  // macOS's, as v3 does.
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
