import { platform } from "@electron-toolkit/utils";
import { app } from "electron";
import { isWindowsDefaultBrowser } from "./windows-mail-client";

const HTTPS_PROTOCOL = "https";

let isDefaultBrowserPromise: Promise<boolean> | undefined;

/**
 * Whether the operating system sends web links to Meru itself.
 *
 * Held from the first ask, because every external link asks and no platform
 * answers cheaply: Windows spawns `reg.exe`, and Electron implements
 * `isDefaultProtocolClient` on Linux by spawning `xdg-settings` on the main
 * thread. `refreshIsDefaultBrowser` drops it, which is what covers a user
 * changing the association while Meru is running.
 *
 * Its own module rather than `./index.ts`, which reaches `@/dialogs` and so
 * cycles back through `@/url`, the one caller that has to ask.
 */
export function getIsDefaultBrowser() {
  isDefaultBrowserPromise ??= platform.isWindows
    ? isWindowsDefaultBrowser()
    : Promise.resolve(app.isDefaultProtocolClient(HTTPS_PROTOCOL));

  return isDefaultBrowserPromise;
}

export function refreshIsDefaultBrowser() {
  isDefaultBrowserPromise = undefined;
}
