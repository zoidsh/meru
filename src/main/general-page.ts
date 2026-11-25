import path from "node:path";

import type { SettingsState } from "#contract/settings.ts";
import { downloadsFolder, shownFolder } from "#core/downloads-folder.ts";
import type { Platform } from "#core/platform.ts";
import type { DownloadFiles } from "#platform/downloads.ts";
import type { LoginItem } from "#platform/login-item.ts";

import type { SettingsStore } from "./settings.ts";

export interface GeneralPageDeps {
  platform: Platform;
  loginItem: LoginItem;
  settings: Pick<SettingsStore, "get" | "update" | "onChange">;
  /**
   * The system's Downloads folder, never made by a page that only shows it,
   * and whether a chosen one is there.
   */
  files: Pick<DownloadFiles, "systemFolder" | "usable">;
  /** The home folder, which macOS shows a folder under as `~`. */
  home: string;
  /** The system's folder picker on the Settings window, at `defaultPath`. */
  pickFolder: (defaultPath: string) => Promise<string | undefined>;
}

/**
 * What the General page shows that is not a plain setting: the system's
 * login item, which Linux has none of here, as in v3, and the folder
 * downloads are saved to, which only the system's picker sets.
 */
export const createGeneralPage = ({
  platform,
  loginItem,
  settings,
  files,
  home,
  pickFolder,
}: GeneralPageDeps) => {
  const listeners = new Set<() => void>();

  const notify = () => {
    for (const listener of listeners) {
      listener();
    }
  };

  settings.onChange("downloadsFolder", notify);

  /** Where the next download goes: the chosen folder while it is usable. */
  const saveFolder = () =>
    downloadsFolder(settings.get("downloadsFolder"), {
      usable: files.usable,
      system: files.systemFolder,
    }).folder;

  return {
    read: (): SettingsState["general"] => {
      const chosen = settings.get("downloadsFolder");

      return {
        openAtLogin:
          platform === "linux"
            ? null
            : { on: loginItem.isOn(), real: loginItem.real },
        downloadsFolder: {
          path: shownFolder(chosen ?? files.systemFolder(), {
            home,
            platform,
          }),
          available: chosen === null || files.usable(chosen),
        },
      };
    },
    setOpenAtLogin: (on: boolean) => {
      if (platform === "linux") {
        throw new Error("Meru has no login item on Linux");
      }

      loginItem.set(on);
      notify();
    },
    /**
     * Opens the picker at where downloads go now and stores the folder
     * chosen; a cancel changes nothing.
     */
    chooseDownloadsFolder: async () => {
      const chosen = await pickFolder(saveFolder());

      if (chosen === undefined) {
        return;
      }

      if (!path.isAbsolute(chosen)) {
        throw new Error("The folder picker gave a relative path");
      }

      await settings.update("downloadsFolder", () => chosen);
    },
    onChange: (listener: () => void) => {
      listeners.add(listener);
    },
  };
};

export type GeneralPage = ReturnType<typeof createGeneralPage>;
