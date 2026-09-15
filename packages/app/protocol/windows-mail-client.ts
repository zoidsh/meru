import * as childProcess from "node:child_process";
import { writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { is, platform } from "@electron-toolkit/utils";
import { ms } from "@meru/shared/ms";
import { app, shell } from "electron";
import { serializeError } from "serialize-error";
import { log } from "@/lib/log";
import { getRegExePath } from "@/lib/windows";
import {
  BROWSER_PROG_ID,
  buildRegistration,
  MAILTO_PROG_ID,
  parseUserChoiceProgIds,
} from "./windows-mail-client-registry";

const execFile = promisify(childProcess.execFile);

const URL_ASSOCIATIONS_KEY = String.raw`HKCU\Software\Microsoft\Windows\Shell\Associations\UrlAssociations`;

/**
 * Windows 11 22H2 added Meru's own page under Default apps, which
 * `registeredAppUser` opens; earlier builds get the plain page.
 */
const DEFAULT_APPS_PAGE_BUILD = 22621;

/**
 * The portable build runs from a temporary extraction that is gone by the next
 * launch, so the registration has to name the executable the user launched.
 * electron-builder's portable launcher passes its arguments on to the app, so a
 * mailto url reaches Meru through it.
 */
function getExecutablePath() {
  return process.env.PORTABLE_EXECUTABLE_FILE ?? process.execPath;
}

/**
 * Rewritten on every launch rather than by the installer, whose write of
 * `Software\Classes\Meru.mailto` Windows 11 did not keep, and because the path
 * it registers moves with an update or a relocated portable copy. Importing the
 * same keys again is a no-op.
 */
export async function registerWindowsMailClient() {
  // A development run would register Electron itself as the mail client
  if (!platform.isWindows || is.dev) {
    return;
  }

  const filePath = path.join(app.getPath("userData"), "windows-mail-client.reg");

  try {
    // UTF-16LE with a BOM, as regedit writes: read as ANSI, an executable path
    // holding characters outside the system code page arrives mangled
    await writeFile(filePath, `\ufeff${buildRegistration(getExecutablePath())}`, "utf16le");

    await execFile(getRegExePath(), ["import", filePath], { timeout: ms("10s") });
  } catch (error) {
    log.error("Failed to register Meru as a Windows mail client", {
      error: serializeError(error),
    });
  }
}

async function queryUserChoiceProgIds(protocol: string, subKey: string) {
  try {
    const { stdout } = await execFile(
      getRegExePath(),
      ["query", `${URL_ASSOCIATIONS_KEY}\\${protocol}\\${subKey}`, "/s"],
      { timeout: ms("10s") },
    );

    return parseUserChoiceProgIds(stdout);
  } catch {
    // `reg.exe` exits non-zero when the key is absent
    return [];
  }
}

/**
 * Windows keeps the association the user picked under `UserChoice`, which only
 * it can write. Windows 11 24H2 writes `UserChoiceLatest` instead and leaves the
 * old key stale, so the newer key wins whenever it has an answer. Not
 * `app.isDefaultProtocolClient`: it reads back the key Electron wrote itself, so
 * it answers yes for a Meru that no link reaches.
 */
async function readUserChoiceProgIds(protocol: string) {
  const [latest, legacy] = await Promise.all([
    queryUserChoiceProgIds(protocol, "UserChoiceLatest"),
    queryUserChoiceProgIds(protocol, "UserChoice"),
  ]);

  return latest.length > 0 ? latest : legacy;
}

export async function isWindowsDefaultMailClient() {
  return (await readUserChoiceProgIds("mailto")).includes(MAILTO_PROG_ID);
}

export async function isWindowsDefaultBrowser() {
  return (await readUserChoiceProgIds("https")).includes(BROWSER_PROG_ID);
}

export function openWindowsDefaultAppsSettings() {
  const buildNumber = Number(os.release().split(".")[2]);

  // Not `openExternalUrl`: its trusted-host dialog and origin check are for web
  // links, and `ms-settings:` has no origin to show
  shell.openExternal(
    buildNumber >= DEFAULT_APPS_PAGE_BUILD
      ? "ms-settings:defaultapps?registeredAppUser=Meru"
      : "ms-settings:defaultapps",
  );
}
