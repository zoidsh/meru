import type { Platform } from "#core/platform.ts";

/** The platform the preload stamps on the document before the shell runs. */
export const shellPlatform = (): Platform => {
  const { platform } = document.documentElement.dataset;

  return platform === "darwin" || platform === "win32" ? platform : "linux";
};
