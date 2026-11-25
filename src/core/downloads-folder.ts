import type { Platform } from "./platform.ts";

/**
 * Where a download goes: the chosen folder while it can take files, else
 * the system's, `fallback` saying the chosen one was passed over.
 */
export const downloadsFolder = (
  chosen: string | null,
  {
    usable,
    system,
  }: { usable: (folder: string) => boolean; system: () => string }
) =>
  chosen !== null && usable(chosen)
    ? { folder: chosen, fallback: false }
    : { folder: system(), fallback: chosen !== null };

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
