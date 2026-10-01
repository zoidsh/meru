import path from "node:path";
import type { SwipeNavigationAddon } from "./types";

export * from "./decide";
export * from "./tuning";
export * from "./types";

export const SWIPE_NAVIGATION_ADDON_FILE_NAME = "swipe-navigation.node";

/**
 * Loaded from a path rather than imported, so the bundler leaves it alone and
 * Electron's asar layer can send the load to the unpacked copy. `directory` is
 * where the app's bundles sit, which only the caller knows.
 */
export function loadSwipeNavigationAddon(directory: string) {
  const addonModule = { exports: {} as SwipeNavigationAddon };

  process.dlopen(addonModule, path.join(directory, SWIPE_NAVIGATION_ADDON_FILE_NAME));

  return addonModule.exports;
}
