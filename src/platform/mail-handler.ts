import { execFile } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { release } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { app, shell } from "electron";

import type { Platform } from "#core/platform.ts";
import {
  choseMeruForMail,
  defaultAppsUrl,
  windowsMailRegistration,
} from "#core/windows-mail-registry.ts";

const run = promisify(execFile);

const MAILTO = "mailto";

// The Settings window waits on it as it regains focus.
const REG_TIMEOUT = 5000;

const CHOICE_KEY = String.raw`HKEY_CURRENT_USER\Software\Microsoft\Windows\Shell\Associations\UrlAssociations\mailto`;

/** Whether the system sends email links to Meru, and where that is changed. */
export interface MailHandler {
  /** `false` where it only pretends, as every build but a release's does. */
  readonly real: boolean;
  isDefault: () => Promise<boolean>;
  /**
   * Makes Meru the handler, or gives the links back to another app, on macOS
   * and Linux; Linux has no way to give them back, and Windows lets no app
   * make itself the default.
   */
  set: (on: boolean) => void;
  /** Windows: Default apps, where Meru is chosen for email links. */
  openSettings: () => Promise<void>;
}

const regExe = () =>
  path.join(
    process.env.SystemRoot ?? process.env.windir ?? String.raw`C:\Windows`,
    "System32",
    "reg.exe"
  );

// `windowsHide`, so a console program run from a window app flashes no
// console window.
const reg = (args: string[]) =>
  run(regExe(), args, { timeout: REG_TIMEOUT, windowsHide: true });

/** `reg query` exits non-zero for a key that is not there. */
const queryChoice = async (subKey: string) => {
  try {
    const { stdout } = await reg([
      "query",
      [CHOICE_KEY, subKey].join("\\"),
      "/s",
    ]);

    return stdout;
  } catch {
    return "";
  }
};

/**
 * Windows' portable build runs from a copy it extracts to the temporary
 * folder, gone by the next launch, so the registration names the portable
 * file itself, whose launcher passes a link on to the app.
 */
const executablePath = () =>
  process.env.PORTABLE_EXECUTABLE_FILE ?? process.execPath;

/**
 * Writes the per-user keys that let Default apps offer Meru for email links,
 * at each launch, since the path moves with an update or a moved portable
 * copy; writing them again changes nothing. UTF-16 with a byte order mark,
 * as regedit writes, so a path outside the system's code page arrives whole.
 */
export const registerWindowsMailHandler = async (userDataPath: string) => {
  const file = path.join(userDataPath, "mail-handler.reg");

  await writeFile(
    file,
    `\uFEFF${windowsMailRegistration(executablePath())}`,
    "utf16le"
  );
  await reg(["import", file]);
};

/**
 * The installed Meru's. On Windows the choice is the person's, read where
 * Windows keeps it; `app.isDefaultProtocolClient` reads back the key Electron
 * itself writes, so it would answer yes for a Meru no link reaches.
 */
export const createMailHandler = (platform: Platform): MailHandler => ({
  real: true,
  isDefault: async () => {
    if (platform !== "win32") {
      return app.isDefaultProtocolClient(MAILTO);
    }

    const [latest, legacy] = await Promise.all([
      queryChoice("UserChoiceLatest"),
      queryChoice("UserChoice"),
    ]);

    return choseMeruForMail(latest, legacy);
  },
  set: (on) => {
    if (platform === "win32") {
      throw new Error("Windows lets no app make itself the mail handler");
    }

    if (on) {
      app.setAsDefaultProtocolClient(MAILTO);
    } else if (platform === "darwin") {
      app.removeAsDefaultProtocolClient(MAILTO);
    } else {
      throw new Error("Linux gives email links back to no other app");
    }
  },
  openSettings: async () => {
    if (platform !== "win32") {
      throw new Error("Only Windows chooses the mail handler in its settings");
    }

    await shell.openExternal(defaultAppsUrl(release()));
  },
});

/**
 * A development build's, held for the run alone, since Meru Dev claims no
 * scheme and must never take an installed Meru's place.
 */
export const createHeldMailHandler = (): MailHandler => {
  let on = false;

  return {
    real: false,
    isDefault: () => Promise.resolve(on),
    set: (next) => {
      on = next;
    },
    openSettings: () => Promise.resolve(),
  };
};

/** What the end-to-end build's stand-in was asked, and what it answers. */
export interface CapturedMailHandler {
  /** Whether it answers as a release's, as it does unless a test says not. */
  real: boolean;
  /** What `isDefault` answers, which a test sets as the system would. */
  isDefault: boolean;
  /** Each value it was asked to set, in order. */
  calls: boolean[];
  settingsOpened: number;
}

/**
 * The end-to-end build's, which never changes the machine's handler or opens
 * a settings pane: each call is kept on `meruTestMailHandler`, whose
 * `isDefault` a set turns as the system would. It answers as a release's,
 * so the suite sees the rows a person does, unless a test sets `real`.
 */
export const createCapturedMailHandler = (): MailHandler => {
  const captured: CapturedMailHandler = {
    real: true,
    isDefault: false,
    calls: [],
    settingsOpened: 0,
  };

  Reflect.set(globalThis, "meruTestMailHandler", captured);

  return {
    get real() {
      return captured.real;
    },
    isDefault: () => Promise.resolve(captured.isDefault),
    set: (on) => {
      captured.calls.push(on);
      captured.isDefault = on;
    },
    openSettings: () => {
      captured.settingsOpened += 1;

      return Promise.resolve();
    },
  };
};
