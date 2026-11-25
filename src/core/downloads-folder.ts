import type { Platform } from "./platform.ts";

/**
 * A folder as the General page shows it: under the home folder as `~` on
 * macOS, as Finder's Go to Folder takes it; the whole path elsewhere.
 */
export const shownFolder = (
  folder: string,
  { home, platform }: { home: string; platform: Platform }
) => {
  if (platform !== "darwin" || home === "" || home === "/") {
    return folder;
  }

  if (folder === home) {
    return "~";
  }

  return folder.startsWith(`${home}/`)
    ? `~${folder.slice(home.length)}`
    : folder;
};
