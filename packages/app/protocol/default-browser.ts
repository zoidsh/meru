import { platform } from "@electron-toolkit/utils";
import { app } from "electron";
import { isWindowsDefaultBrowser, refreshWindowsDefaultBrowser } from "./windows-mail-client";

const HTTPS_PROTOCOL = "https";

/**
 * Whether the operating system sends web links to Meru itself.
 *
 * Its own module rather than `./index.ts`, which reaches `@/dialogs` and so
 * cycles back through `@/url`, the one caller that has to ask.
 */
export async function getIsDefaultBrowser() {
  return platform.isWindows
    ? isWindowsDefaultBrowser()
    : app.isDefaultProtocolClient(HTTPS_PROTOCOL);
}

/** Drops the Windows answer, which the next ask recomputes. */
export function refreshIsDefaultBrowser() {
  if (platform.isWindows) {
    refreshWindowsDefaultBrowser();
  }
}
