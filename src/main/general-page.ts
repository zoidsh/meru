import path from "node:path";

import type { SettingsState } from "#contract/settings.ts";
import { downloadsFolder, shownFolder } from "#core/downloads-folder.ts";
import type { Platform } from "#core/platform.ts";
import { languageName } from "#i18n/index.ts";
import type { DownloadFiles } from "#platform/downloads.ts";
import type { LoginItem } from "#platform/login-item.ts";

import type { Language } from "./language.ts";
import type { SettingsStore } from "./settings.ts";
import type { Spellcheck } from "./spellcheck.ts";

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
  language: Pick<Language, "system" | "available">;
  /** None on macOS, which checks spelling with its own. */
  spellcheck: Pick<Spellcheck, "read"> | undefined;
}

/**
 * What the General page shows that is not a plain setting: the languages it
 * offers, the system's login item, which Linux has none of here, as in v3,
 * and the folder downloads are saved to, which only the system's picker sets.
 */
export const createGeneralPage = ({
  platform,
  loginItem,
  settings,
  files,
  home,
  pickFolder,
  language,
  spellcheck,
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
        language: {
          system: languageName(language.system()),
          choices: language.available.map((tag) => ({
            language: tag,
            name: languageName(tag),
          })),
        },
        spelling: spellcheck?.read() ?? null,
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
    /**
     * Applied to the list as stored when the store gets to it, so two quick
     * toggles both hold, which a list sent from the page would not.
     */
    setSpellcheckLanguage: async (code: string, on: boolean) => {
      if (!spellcheck) {
        throw new Error("Meru checks spelling with the system's own on macOS");
      }

      await settings.update("spellcheckLanguages", (languages) => {
        const others = languages.filter((each) => each !== code);

        return on ? [...others, code] : others;
      });
    },
    onChange: (listener: () => void) => {
      listeners.add(listener);
    },
  };
};

export type GeneralPage = ReturnType<typeof createGeneralPage>;
